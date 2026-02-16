// Package messages handles chat messages and thread replies.
package messages

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/nbd-wtf/go-nostr"
)

var ErrNotFound = errors.New("message not found")

type Message struct {
	ID          int64   `json:"id"`
	ChannelID   int64   `json:"channelId"`
	UserID      int64   `json:"userId"`
	ParentID    *int64  `json:"parentId,omitempty"`
	Content     string  `json:"content"`
	EventID     string  `json:"eventId,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	ReplyCount  int     `json:"replyCount,omitempty"`
	IsBot       bool    `json:"isBot,omitempty"`
}

type Service struct {
	db         *db.DB
	relayPriv  string // relay private key for signing events
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// SetRelayKey sets the private key used to sign nostr events.
func (s *Service) SetRelayKey(privkey string) {
	s.relayPriv = privkey
}

// Create creates a new top-level message in a channel.
func (s *Service) Create(channelID, userID int64, content, groupID string) (*Message, error) {
	eventID, err := s.createEvent(content, groupID, "", "")
	if err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, content, event_id, created_at) VALUES (?, ?, ?, ?, ?)",
		channelID, userID, content, eventID, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// CreateReply creates a thread reply to an existing message.
func (s *Service) CreateReply(parentID, userID int64, content string, groupID string) (*Message, error) {
	// Look up parent to get channel and event_id
	parent, err := s.GetByID(parentID)
	if err != nil {
		return nil, fmt.Errorf("parent not found: %w", err)
	}
	if parent.ParentID != nil {
		return nil, errors.New("cannot reply to a reply (threads are one level deep)")
	}

	// Get parent author pubkey for p-tag (best effort)
	parentEventID := parent.EventID

	eventID, err := s.createEvent(content, groupID, parentEventID, "")
	if err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, parent_id, content, event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		parent.ChannelID, userID, parentID, content, eventID, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// GetByID returns a single message by ID with user info.
func (s *Service) GetByID(id int64) (*Message, error) {
	var m Message
	var parentID sql.NullInt64
	var eventID sql.NullString
	var role string
	err := s.db.QueryRow(`
		SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.created_at,
		       u.username, u.display_name, u.role,
		       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) as reply_count
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.id = ?
	`, id).Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &m.CreatedAt,
		&m.Username, &m.DisplayName, &role, &m.ReplyCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	m.IsBot = role == "bot"
	if parentID.Valid {
		m.ParentID = &parentID.Int64
	}
	if eventID.Valid {
		m.EventID = eventID.String
	}
	return &m, nil
}

// ListChannel returns top-level messages for a channel (no replies), ordered newest-first.
// Use before (message ID) for cursor pagination.
func (s *Service) ListChannel(channelID int64, limit int, before int64) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var rows *sql.Rows
	var err error
	if before > 0 {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.content, m.event_id, m.created_at,
			       u.username, u.display_name, u.role,
			       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) as reply_count
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.id < ?
			ORDER BY m.id DESC LIMIT ?
		`, channelID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.content, m.event_id, m.created_at,
			       u.username, u.display_name, u.role,
			       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) as reply_count
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.parent_id IS NULL
			ORDER BY m.id DESC LIMIT ?
		`, channelID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		var eventID sql.NullString
		var role string
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Content, &eventID, &m.CreatedAt,
			&m.Username, &m.DisplayName, &role, &m.ReplyCount); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		if eventID.Valid {
			m.EventID = eventID.String
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// ListThread returns replies for a parent message, ordered oldest-first.
func (s *Service) ListThread(parentID int64, limit int, before int64) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var rows *sql.Rows
	var err error
	if before > 0 {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.created_at,
			       u.username, u.display_name, u.role
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id = ? AND m.id < ?
			ORDER BY m.id ASC LIMIT ?
		`, parentID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.created_at,
			       u.username, u.display_name, u.role
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id = ?
			ORDER BY m.id ASC LIMIT ?
		`, parentID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		var parentID sql.NullInt64
		var eventID sql.NullString
		var role string
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &m.CreatedAt,
			&m.Username, &m.DisplayName, &role); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		if parentID.Valid {
			m.ParentID = &parentID.Int64
		}
		if eventID.Valid {
			m.EventID = eventID.String
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// createEvent builds a signed kind-1 nostr event and returns its ID.
func (s *Service) createEvent(content, groupID, parentEventID, parentPubkey string) (string, error) {
	privkey := s.relayPriv
	if privkey == "" {
		// Generate a throwaway key if none configured
		privkey = nostr.GeneratePrivateKey()
	}

	pubkey, err := nostr.GetPublicKey(privkey)
	if err != nil {
		return "", fmt.Errorf("get pubkey: %w", err)
	}

	tags := nostr.Tags{
		{"h", groupID},
	}
	if parentEventID != "" {
		tags = append(tags, nostr.Tag{"e", parentEventID, "", "reply"})
	}
	if parentPubkey != "" {
		tags = append(tags, nostr.Tag{"p", parentPubkey})
	}

	ev := nostr.Event{
		PubKey:    pubkey,
		CreatedAt: nostr.Timestamp(time.Now().Unix()),
		Kind:      1,
		Tags:      tags,
		Content:   content,
	}
	if err := ev.Sign(privkey); err != nil {
		return "", fmt.Errorf("sign event: %w", err)
	}

	return ev.ID, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
