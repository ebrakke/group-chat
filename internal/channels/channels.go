// Package channels manages chat channels and membership.
package channels

import (
	"database/sql"
	"errors"

	"github.com/ebrakke/relay-chat/internal/db"
)

var ErrNotFound = errors.New("channel not found")

type Channel struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// EnsureGeneral creates the #general channel if it doesn't exist, and returns it.
func (s *Service) EnsureGeneral() (*Channel, error) {
	ch, err := s.GetByName("general")
	if err == nil {
		return ch, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	return s.Create("general")
}

// Create creates a new channel.
func (s *Service) Create(name string) (*Channel, error) {
	res, err := s.db.Exec("INSERT INTO channels (name) VALUES (?)", name)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// GetByID returns a channel by ID.
func (s *Service) GetByID(id int64) (*Channel, error) {
	var ch Channel
	err := s.db.QueryRow("SELECT id, name, created_at FROM channels WHERE id = ?", id).
		Scan(&ch.ID, &ch.Name, &ch.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &ch, err
}

// GetByName returns a channel by name.
func (s *Service) GetByName(name string) (*Channel, error) {
	var ch Channel
	err := s.db.QueryRow("SELECT id, name, created_at FROM channels WHERE name = ?", name).
		Scan(&ch.ID, &ch.Name, &ch.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &ch, err
}

// List returns all channels.
func (s *Service) List() ([]Channel, error) {
	rows, err := s.db.Query("SELECT id, name, created_at FROM channels ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.CreatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, rows.Err()
}

// AddMember adds a user to a channel.
func (s *Service) AddMember(channelID, userID int64) error {
	_, err := s.db.Exec(
		"INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)",
		channelID, userID,
	)
	return err
}

// ListMembers returns user IDs in a channel.
func (s *Service) ListMembers(channelID int64) ([]int64, error) {
	rows, err := s.db.Query("SELECT user_id FROM channel_members WHERE channel_id = ?", channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// IsMember checks if a user is a member of a channel.
func (s *Service) IsMember(channelID, userID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM channel_members WHERE channel_id = ? AND user_id = ?",
		channelID, userID,
	).Scan(&count)
	return count > 0, err
}

// ChannelWithUnread extends Channel with unread tracking info.
type ChannelWithUnread struct {
	Channel
	UnreadCount int  `json:"unreadCount"`
	HasMention  bool `json:"hasMention"`
}

// ListForUser returns all channels with unread counts for a specific user.
func (s *Service) ListForUser(userID int64, username string) ([]ChannelWithUnread, error) {
	rows, err := s.db.Query(`
		SELECT
			c.id, c.name, c.created_at,
			(SELECT COUNT(*) FROM messages m
			 WHERE m.channel_id = c.id
			   AND m.parent_id IS NULL
			   AND m.id > COALESCE(cm.last_read_msg_id, 0)) AS unread_count,
			EXISTS(
				SELECT 1 FROM messages m2
				WHERE m2.channel_id = c.id
				  AND m2.parent_id IS NULL
				  AND m2.id > COALESCE(cm.last_read_msg_id, 0)
				  AND m2.content LIKE '%@' || ? || '%'
			) AS has_mention
		FROM channels c
		LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
		ORDER BY c.name
	`, username, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []ChannelWithUnread
	for rows.Next() {
		var ch ChannelWithUnread
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.CreatedAt, &ch.UnreadCount, &ch.HasMention); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, rows.Err()
}

// MarkRead updates the last-read message ID for a user in a channel.
// The cursor only moves forward (MAX prevents going backward).
func (s *Service) MarkRead(channelID, userID, msgID int64) error {
	_, err := s.db.Exec(`
		UPDATE channel_members
		SET last_read_msg_id = MAX(COALESCE(last_read_msg_id, 0), ?)
		WHERE channel_id = ? AND user_id = ?
	`, msgID, channelID, userID)
	return err
}
