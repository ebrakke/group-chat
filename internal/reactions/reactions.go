// Package reactions handles emoji reactions on messages.
package reactions

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/nbd-wtf/go-nostr"
)

// AllowedEmojis is the fixed set of allowed reaction emojis.
var AllowedEmojis = []string{
	"👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "🙏",
}

var allowedSet = func() map[string]bool {
	m := make(map[string]bool, len(AllowedEmojis))
	for _, e := range AllowedEmojis {
		m[e] = true
	}
	return m
}()

var (
	ErrInvalidEmoji = errors.New("emoji not in allowed set")
	ErrNotFound     = errors.New("reaction not found")
)

// Reaction represents a single user reaction on a message.
type Reaction struct {
	ID          int64  `json:"id"`
	MessageID   int64  `json:"messageId"`
	UserID      int64  `json:"userId"`
	Emoji       string `json:"emoji"`
	EventID     string `json:"eventId,omitempty"`
	CreatedAt   string `json:"createdAt"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

// ReactionSummary is an aggregated view of reactions per emoji on a message.
type ReactionSummary struct {
	Emoji     string   `json:"emoji"`
	Count     int      `json:"count"`
	UserIDs   []int64  `json:"userIds"`
	UserNames []string `json:"userNames"`
}

// Service provides reaction operations.
type Service struct {
	db        *db.DB
	relayPriv string
}

// NewService creates a new reactions service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// SetRelayKey sets the private key used to sign nostr events.
func (s *Service) SetRelayKey(privkey string) {
	s.relayPriv = privkey
}

// Toggle adds a reaction if it doesn't exist, or removes it if it does.
// Returns the reaction and true if added, nil and false if removed.
func (s *Service) Toggle(messageID, userID int64, emoji, groupID string) (*Reaction, bool, error) {
	if !allowedSet[emoji] {
		return nil, false, ErrInvalidEmoji
	}

	// Check if reaction already exists
	var existingID int64
	err := s.db.QueryRow(
		"SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
		messageID, userID, emoji,
	).Scan(&existingID)

	if err == nil {
		// Exists — remove it
		_, err := s.db.Exec("DELETE FROM reactions WHERE id = ?", existingID)
		if err != nil {
			return nil, false, fmt.Errorf("delete reaction: %w", err)
		}
		return nil, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, fmt.Errorf("check existing: %w", err)
	}

	// Does not exist — add it
	eventID, err := s.createEvent(emoji, groupID, messageID)
	if err != nil {
		return nil, false, fmt.Errorf("create event: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO reactions (message_id, user_id, emoji, event_id, created_at) VALUES (?, ?, ?, ?, ?)",
		messageID, userID, emoji, eventID, now,
	)
	if err != nil {
		return nil, false, fmt.Errorf("insert reaction: %w", err)
	}

	id, _ := res.LastInsertId()
	r, err := s.getByID(id)
	if err != nil {
		return nil, false, err
	}
	return r, true, nil
}

// Add adds a reaction (idempotent — no-op if already exists).
func (s *Service) Add(messageID, userID int64, emoji, groupID string) (*Reaction, error) {
	if !allowedSet[emoji] {
		return nil, ErrInvalidEmoji
	}

	// Check if already exists
	var existingID int64
	err := s.db.QueryRow(
		"SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
		messageID, userID, emoji,
	).Scan(&existingID)
	if err == nil {
		return s.getByID(existingID)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing: %w", err)
	}

	eventID, err := s.createEvent(emoji, groupID, messageID)
	if err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO reactions (message_id, user_id, emoji, event_id, created_at) VALUES (?, ?, ?, ?, ?)",
		messageID, userID, emoji, eventID, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert reaction: %w", err)
	}

	id, _ := res.LastInsertId()
	return s.getByID(id)
}

// Remove removes a reaction.
func (s *Service) Remove(messageID, userID int64, emoji string) error {
	if !allowedSet[emoji] {
		return ErrInvalidEmoji
	}

	res, err := s.db.Exec(
		"DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
		messageID, userID, emoji,
	)
	if err != nil {
		return fmt.Errorf("delete reaction: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// SummaryForMessages returns reaction summaries keyed by message ID.
func (s *Service) SummaryForMessages(messageIDs []int64) (map[int64][]ReactionSummary, error) {
	if len(messageIDs) == 0 {
		return nil, nil
	}

	// Build placeholders
	placeholders := make([]byte, 0, len(messageIDs)*2)
	args := make([]interface{}, len(messageIDs))
	for i, id := range messageIDs {
		if i > 0 {
			placeholders = append(placeholders, ',')
		}
		placeholders = append(placeholders, '?')
		args[i] = id
	}

	rows, err := s.db.Query(
		fmt.Sprintf(`SELECT r.message_id, r.emoji, COUNT(*) as cnt,
			GROUP_CONCAT(r.user_id) as user_ids,
			GROUP_CONCAT(u.display_name) as user_names
			FROM reactions r
			JOIN users u ON r.user_id = u.id
			WHERE r.message_id IN (%s)
			GROUP BY r.message_id, r.emoji
			ORDER BY r.message_id, MIN(r.id)`, string(placeholders)),
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("query summaries: %w", err)
	}
	defer rows.Close()

	result := make(map[int64][]ReactionSummary)
	for rows.Next() {
		var msgID int64
		var emoji string
		var count int
		var userIDsStr string
		var userNamesStr string
		if err := rows.Scan(&msgID, &emoji, &count, &userIDsStr, &userNamesStr); err != nil {
			return nil, err
		}
		var userIDs []int64
		for _, s := range splitCSV(userIDsStr) {
			var uid int64
			fmt.Sscanf(s, "%d", &uid)
			if uid > 0 {
				userIDs = append(userIDs, uid)
			}
		}
		userNames := splitCSV(userNamesStr)
		result[msgID] = append(result[msgID], ReactionSummary{
			Emoji:     emoji,
			Count:     count,
			UserIDs:   userIDs,
			UserNames: userNames,
		})
	}
	return result, rows.Err()
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func (s *Service) getByID(id int64) (*Reaction, error) {
	var r Reaction
	var eventID sql.NullString
	err := s.db.QueryRow(`
		SELECT r.id, r.message_id, r.user_id, r.emoji, r.event_id, r.created_at,
		       u.username, u.display_name
		FROM reactions r
		JOIN users u ON r.user_id = u.id
		WHERE r.id = ?
	`, id).Scan(&r.ID, &r.MessageID, &r.UserID, &r.Emoji, &eventID, &r.CreatedAt,
		&r.Username, &r.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if eventID.Valid {
		r.EventID = eventID.String
	}
	return &r, nil
}

// createEvent builds a signed kind-7 nostr reaction event.
func (s *Service) createEvent(emoji, groupID string, messageID int64) (string, error) {
	privkey := s.relayPriv
	if privkey == "" {
		privkey = nostr.GeneratePrivateKey()
	}

	pubkey, err := nostr.GetPublicKey(privkey)
	if err != nil {
		return "", fmt.Errorf("get pubkey: %w", err)
	}

	// Look up the target message's event_id for the e tag
	var targetEventID sql.NullString
	s.db.QueryRow("SELECT event_id FROM messages WHERE id = ?", messageID).Scan(&targetEventID)

	tags := nostr.Tags{
		{"h", groupID},
	}
	if targetEventID.Valid && targetEventID.String != "" {
		tags = append(tags, nostr.Tag{"e", targetEventID.String})
	}

	ev := nostr.Event{
		PubKey:    pubkey,
		CreatedAt: nostr.Timestamp(time.Now().Unix()),
		Kind:      7,
		Tags:      tags,
		Content:   emoji,
	}
	if err := ev.Sign(privkey); err != nil {
		return "", fmt.Errorf("sign event: %w", err)
	}

	return ev.ID, nil
}
