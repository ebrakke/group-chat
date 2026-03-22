// Package dms manages direct message conversations.
package dms

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/ebrakke/relay-chat/internal/db"
)

var (
	ErrNotFound = errors.New("dm conversation not found")
	ErrSelfDM   = errors.New("cannot start a DM with yourself")
)

// Conversation represents a DM conversation between two users.
type Conversation struct {
	ID        int64  `json:"id"`
	ChannelID int64  `json:"channelId"`
	User1ID   int64  `json:"user1Id"`
	User2ID   int64  `json:"user2Id"`
	CreatedAt string `json:"createdAt"`
}

// ConversationWithUser extends Conversation with information about the other participant
// and last message preview.
type ConversationWithUser struct {
	Conversation
	OtherUserID           int64  `json:"otherUserId"`
	OtherUsername         string `json:"otherUsername"`
	OtherDisplayName      string `json:"otherDisplayName"`
	OtherAvatarURL        string `json:"otherAvatarUrl,omitempty"`
	LastMessageContent    string `json:"lastMessageContent,omitempty"`
	LastMessageAt         string `json:"lastMessageAt,omitempty"`
	LastMessageSenderName string `json:"lastMessageSenderName,omitempty"`
	UnreadCount           int    `json:"unreadCount"`
}

// Service handles DM conversation operations.
type Service struct {
	db *db.DB
}

// NewService creates a new DM service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// GetOrCreate returns an existing DM conversation between two users, or creates one.
// User IDs are stored in canonical order (lower ID first) to prevent duplicates.
func (s *Service) GetOrCreate(userAID, userBID int64) (*Conversation, error) {
	if userAID == userBID {
		return nil, ErrSelfDM
	}

	// Canonical ordering: lower ID first
	user1ID, user2ID := userAID, userBID
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	// Try to find existing conversation
	conv, err := s.getByUsers(user1ID, user2ID)
	if err == nil {
		return conv, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	// Create backing channel
	channelName := fmt.Sprintf("dm-%d-%d", user1ID, user2ID)
	res, err := s.db.Exec("INSERT INTO channels (name, is_dm) VALUES (?, 1)", channelName)
	if err != nil {
		// Could be a race — try fetching again
		conv, err2 := s.getByUsers(user1ID, user2ID)
		if err2 == nil {
			return conv, nil
		}
		return nil, fmt.Errorf("create dm channel: %w", err)
	}
	channelID, _ := res.LastInsertId()

	// Create conversation record
	res, err = s.db.Exec(
		"INSERT INTO dm_conversations (channel_id, user1_id, user2_id) VALUES (?, ?, ?)",
		channelID, user1ID, user2ID,
	)
	if err != nil {
		// Race on the UNIQUE constraint — fetch the existing one
		conv, err2 := s.getByUsers(user1ID, user2ID)
		if err2 == nil {
			return conv, nil
		}
		return nil, fmt.Errorf("create dm conversation: %w", err)
	}
	convID, _ := res.LastInsertId()
	return s.GetByID(convID)
}

// getByUsers fetches a conversation by the two canonical user IDs.
func (s *Service) getByUsers(user1ID, user2ID int64) (*Conversation, error) {
	var conv Conversation
	err := s.db.QueryRow(
		"SELECT id, channel_id, user1_id, user2_id, created_at FROM dm_conversations WHERE user1_id = ? AND user2_id = ?",
		user1ID, user2ID,
	).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &conv, err
}

// GetByID returns a conversation by its ID.
func (s *Service) GetByID(id int64) (*Conversation, error) {
	var conv Conversation
	err := s.db.QueryRow(
		"SELECT id, channel_id, user1_id, user2_id, created_at FROM dm_conversations WHERE id = ?",
		id,
	).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &conv, err
}

// GetByChannelID returns a conversation by its backing channel ID.
func (s *Service) GetByChannelID(channelID int64) (*Conversation, error) {
	var conv Conversation
	err := s.db.QueryRow(
		"SELECT id, channel_id, user1_id, user2_id, created_at FROM dm_conversations WHERE channel_id = ?",
		channelID,
	).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &conv, err
}

// ListForUser returns all conversations for a user with other-user info and last message preview.
// Results are sorted by most recent activity (last message or conversation creation).
func (s *Service) ListForUser(userID int64) ([]ConversationWithUser, error) {
	rows, err := s.db.Query(`
		SELECT
			dc.id, dc.channel_id, dc.user1_id, dc.user2_id, dc.created_at,
			u.id AS other_user_id,
			u.username AS other_username,
			u.display_name AS other_display_name,
			COALESCE('/api/files/' || u.profile_picture_id, '') AS other_avatar_url,
			COALESCE(lm.content, '') AS last_message_content,
			COALESCE(lm.created_at, '') AS last_message_at,
			COALESCE(lm.display_name, '') AS last_message_sender_name,
			(
				SELECT COUNT(*)
				FROM messages m2
				WHERE m2.channel_id = dc.channel_id
				  AND m2.parent_id IS NULL
				  AND m2.id > COALESCE(
					(SELECT last_read_msg_id FROM channel_reads WHERE channel_id = dc.channel_id AND user_id = ?),
					0
				  )
			) AS unread_count
		FROM dm_conversations dc
		JOIN users u ON u.id = CASE WHEN dc.user1_id = ? THEN dc.user2_id ELSE dc.user1_id END
		LEFT JOIN (
			SELECT
				m.channel_id,
				CASE WHEN LENGTH(m.content) > 100 THEN SUBSTR(m.content, 1, 100) || '...' ELSE m.content END AS content,
				m.created_at,
				u2.display_name
			FROM messages m
			JOIN users u2 ON u2.id = m.user_id
			WHERE m.id = (
				SELECT MAX(m3.id) FROM messages m3
				WHERE m3.channel_id = m.channel_id AND m3.parent_id IS NULL
			)
		) lm ON lm.channel_id = dc.channel_id
		WHERE dc.user1_id = ? OR dc.user2_id = ?
		ORDER BY COALESCE(lm.created_at, dc.created_at) DESC
	`, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []ConversationWithUser
	for rows.Next() {
		var c ConversationWithUser
		if err := rows.Scan(
			&c.ID, &c.ChannelID, &c.User1ID, &c.User2ID, &c.CreatedAt,
			&c.OtherUserID, &c.OtherUsername, &c.OtherDisplayName, &c.OtherAvatarURL,
			&c.LastMessageContent, &c.LastMessageAt, &c.LastMessageSenderName,
			&c.UnreadCount,
		); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}

// ListAll returns all conversations (used for hub startup loading).
func (s *Service) ListAll() ([]Conversation, error) {
	rows, err := s.db.Query(
		"SELECT id, channel_id, user1_id, user2_id, created_at FROM dm_conversations ORDER BY id",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.ChannelID, &c.User1ID, &c.User2ID, &c.CreatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}

// IsDMChannel returns true if the given channel ID belongs to a DM conversation.
func (s *Service) IsDMChannel(channelID int64) bool {
	var isDM bool
	err := s.db.QueryRow(
		"SELECT is_dm FROM channels WHERE id = ?", channelID,
	).Scan(&isDM)
	return err == nil && isDM
}

// IsParticipant returns true if the user is a participant in the given DM channel.
func (s *Service) IsParticipant(channelID, userID int64) bool {
	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM dm_conversations WHERE channel_id = ? AND (user1_id = ? OR user2_id = ?)",
		channelID, userID, userID,
	).Scan(&count)
	return err == nil && count > 0
}

// GetOtherUserID returns the ID of the other participant in a DM channel.
func (s *Service) GetOtherUserID(channelID, userID int64) (int64, error) {
	var otherID int64
	err := s.db.QueryRow(`
		SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END
		FROM dm_conversations
		WHERE channel_id = ? AND (user1_id = ? OR user2_id = ?)
	`, userID, channelID, userID, userID).Scan(&otherID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return otherID, err
}
