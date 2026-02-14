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
