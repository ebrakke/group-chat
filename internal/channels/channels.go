// Package channels manages chat channels and read-state tracking.
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
				SELECT 1 FROM messages m2, json_each(COALESCE(m2.mentions, '[]'))
				WHERE m2.channel_id = c.id
				  AND m2.parent_id IS NULL
				  AND m2.id > COALESCE(cm.last_read_msg_id, 0)
				  AND lower(json_each.value) = lower(?)
			) AS has_mention
		FROM channels c
		LEFT JOIN channel_reads cm ON cm.channel_id = c.id AND cm.user_id = ?
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
// Uses upsert so it works without pre-existing rows. Cursor only moves forward.
func (s *Service) MarkRead(channelID, userID, msgID int64) error {
	_, err := s.db.Exec(`
		INSERT INTO channel_reads (channel_id, user_id, last_read_msg_id)
		VALUES (?, ?, ?)
		ON CONFLICT(channel_id, user_id) DO UPDATE
		SET last_read_msg_id = MAX(COALESCE(channel_reads.last_read_msg_id, 0), excluded.last_read_msg_id)
	`, channelID, userID, msgID)
	return err
}
