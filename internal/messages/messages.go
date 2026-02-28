// Package messages handles chat messages and thread replies.
package messages

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/nbd-wtf/go-nostr"
)

var mentionRe = regexp.MustCompile(`@([a-zA-Z0-9_-]+)`)
var urlRe = regexp.MustCompile(`https?://[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'")\]}]`)

const maxPreviews = 3

var ErrNotFound = errors.New("message not found")
var ErrForbidden = errors.New("forbidden")

type Message struct {
	ID           int64         `json:"id"`
	ChannelID    int64         `json:"channelId"`
	UserID       int64         `json:"userId"`
	ParentID     *int64        `json:"parentId,omitempty"`
	Content      string        `json:"content"`
	EventID      string        `json:"eventId,omitempty"`
	CreatedAt    string        `json:"createdAt"`
	Username     string        `json:"username"`
	DisplayName  string        `json:"displayName"`
	ReplyCount   int           `json:"replyCount,omitempty"`
	IsBot        bool          `json:"isBot,omitempty"`
	Mentions     []string      `json:"mentions,omitempty"`
	LinkPreviews []LinkPreview `json:"linkPreviews,omitempty"`
	EditedAt     *string       `json:"editedAt,omitempty"`
	DeletedAt    *string       `json:"deletedAt,omitempty"`
}

type LinkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"siteName,omitempty"`
}

type Service struct {
	db         *db.DB
	relayPriv  string                 // relay private key for signing events
	notifyFunc func(*Message, string) // callback for notifications
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// SetRelayKey sets the private key used to sign nostr events.
func (s *Service) SetRelayKey(privkey string) {
	s.relayPriv = privkey
}

// SetNotifyFunc sets the callback for sending notifications.
func (s *Service) SetNotifyFunc(fn func(*Message, string)) {
	s.notifyFunc = fn
}

// Create creates a new top-level message in a channel.
func (s *Service) Create(channelID, userID int64, content, groupID string) (*Message, error) {
	eventID, err := s.createEvent(content, groupID, "", "")
	if err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	// Extract and serialize mentions
	mentions := extractMentions(content)
	mentionsJSON, _ := json.Marshal(mentions)

	// Extract URLs and fetch OG metadata
	previews := fetchLinkPreviews(content)
	var previewsJSON []byte
	if len(previews) > 0 {
		previewsJSON, _ = json.Marshal(previews)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, content, event_id, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		channelID, userID, content, eventID, mentionsJSON, previewsJSON, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	msg, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Send notifications
	if s.notifyFunc != nil {
		// Get channel name
		var channelName string
		s.db.QueryRow("SELECT name FROM channels WHERE id = ?", channelID).Scan(&channelName)
		s.notifyFunc(msg, channelName)
	}

	return msg, nil
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

	// Extract and serialize mentions
	mentions := extractMentions(content)
	mentionsJSON, _ := json.Marshal(mentions)

	// Extract URLs and fetch OG metadata
	previews := fetchLinkPreviews(content)
	var previewsJSON []byte
	if len(previews) > 0 {
		previewsJSON, _ = json.Marshal(previews)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, parent_id, content, event_id, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		parent.ChannelID, userID, parentID, content, eventID, mentionsJSON, previewsJSON, now,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	msg, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Send notifications
	if s.notifyFunc != nil {
		// Get channel name
		var channelName string
		s.db.QueryRow("SELECT name FROM channels WHERE id = ?", parent.ChannelID).Scan(&channelName)
		s.notifyFunc(msg, channelName)
	}

	return msg, nil
}

// GetByID returns a single message by ID with user info.
func (s *Service) GetByID(id int64) (*Message, error) {
	var m Message
	var parentID sql.NullInt64
	var eventID sql.NullString
	var previewsJSON sql.NullString
	var editedAt sql.NullString
	var deletedAt sql.NullString
	var role string
	err := s.db.QueryRow(`
		SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at,
		       m.edited_at, m.deleted_at,
		       u.username, u.display_name, u.role,
		       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.id = ?
	`, id).Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
		&editedAt, &deletedAt,
		&m.Username, &m.DisplayName, &role, &m.ReplyCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	m.IsBot = role == "bot"
	m.Mentions = extractMentions(m.Content)
	if parentID.Valid {
		m.ParentID = &parentID.Int64
	}
	if eventID.Valid {
		m.EventID = eventID.String
	}
	if previewsJSON.Valid {
		json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
	}
	if editedAt.Valid {
		m.EditedAt = &editedAt.String
	}
	if deletedAt.Valid {
		m.DeletedAt = &deletedAt.String
	}
	return &m, nil
}

// Edit updates the content of a message. Only the message owner can edit.
func (s *Service) Edit(messageID, userID int64, newContent string) (*Message, error) {
	msg, err := s.GetByID(messageID)
	if err != nil {
		return nil, err
	}
	if msg.DeletedAt != nil {
		return nil, ErrNotFound
	}
	if msg.UserID != userID {
		return nil, ErrForbidden
	}

	// Extract and serialize mentions
	mentions := extractMentions(newContent)
	mentionsJSON, _ := json.Marshal(mentions)

	// Extract URLs and fetch OG metadata
	previews := fetchLinkPreviews(newContent)
	var previewsJSON []byte
	if len(previews) > 0 {
		previewsJSON, _ = json.Marshal(previews)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		"UPDATE messages SET content = ?, mentions = ?, link_previews = ?, edited_at = ? WHERE id = ?",
		newContent, mentionsJSON, previewsJSON, now, messageID,
	)
	if err != nil {
		return nil, err
	}

	return s.GetByID(messageID)
}

// Delete soft-deletes a message. The owner or an admin can delete.
func (s *Service) Delete(messageID, userID int64, isAdmin bool) error {
	msg, err := s.GetByID(messageID)
	if err != nil {
		return err
	}
	if msg.UserID != userID && !isAdmin {
		return ErrForbidden
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec("UPDATE messages SET deleted_at = ? WHERE id = ?", now, messageID)
	return err
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
			SELECT m.id, m.channel_id, m.user_id, m.content, m.event_id, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role,
			       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.deleted_at IS NULL AND m.id < ?
			ORDER BY m.id DESC LIMIT ?
		`, channelID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.content, m.event_id, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role,
			       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.deleted_at IS NULL
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
		var previewsJSON sql.NullString
		var editedAt sql.NullString
		var deletedAt sql.NullString
		var role string
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
			&editedAt, &deletedAt,
			&m.Username, &m.DisplayName, &role, &m.ReplyCount); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		m.Mentions = extractMentions(m.Content)
		if eventID.Valid {
			m.EventID = eventID.String
		}
		if previewsJSON.Valid {
			json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
		}
		if editedAt.Valid {
			m.EditedAt = &editedAt.String
		}
		if deletedAt.Valid {
			m.DeletedAt = &deletedAt.String
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
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id = ? AND m.deleted_at IS NULL AND m.id < ?
			ORDER BY m.id ASC LIMIT ?
		`, parentID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id = ? AND m.deleted_at IS NULL
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
		var previewsJSON sql.NullString
		var editedAt sql.NullString
		var deletedAt sql.NullString
		var role string
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
			&editedAt, &deletedAt,
			&m.Username, &m.DisplayName, &role); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		m.Mentions = extractMentions(m.Content)
		if parentID.Valid {
			m.ParentID = &parentID.Int64
		}
		if eventID.Valid {
			m.EventID = eventID.String
		}
		if previewsJSON.Valid {
			json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
		}
		if editedAt.Valid {
			m.EditedAt = &editedAt.String
		}
		if deletedAt.Valid {
			m.DeletedAt = &deletedAt.String
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// ThreadSummary is a lightweight representation of a thread for the "My Threads" view.
type ThreadSummary struct {
	ParentID       int64  `json:"parentId"`
	ChannelID      int64  `json:"channelId"`
	ChannelName    string `json:"channelName"`
	AuthorUsername string `json:"authorUsername"`
	AuthorDisplay  string `json:"authorDisplayName"`
	AuthorIsBot    bool   `json:"authorIsBot,omitempty"`
	ContentPreview string `json:"contentPreview"`
	ReplyCount     int    `json:"replyCount"`
	LastActivityAt string `json:"lastActivityAt"`
}

// ListUserThreads returns threads the user has participated in (started or replied to),
// sorted by most recent activity.
func (s *Service) ListUserThreads(userID int64, limit int) ([]ThreadSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	rows, err := s.db.Query(`
		SELECT
			p.id,
			p.channel_id,
			c.name,
			u.username,
			u.display_name,
			u.role,
			p.content,
			(SELECT COUNT(*) FROM messages r WHERE r.parent_id = p.id AND r.deleted_at IS NULL) AS reply_count,
			COALESCE(
				(SELECT MAX(r2.created_at) FROM messages r2 WHERE r2.parent_id = p.id AND r2.deleted_at IS NULL),
				p.created_at
			) AS last_activity
		FROM messages p
		JOIN users u ON p.user_id = u.id
		JOIN channels c ON p.channel_id = c.id
		WHERE p.parent_id IS NULL
		  AND p.deleted_at IS NULL
		  AND p.id IN (
			  SELECT m1.id FROM messages m1
			  WHERE m1.user_id = ? AND m1.parent_id IS NULL
			  UNION
			  SELECT m2.parent_id FROM messages m2
			  WHERE m2.user_id = ? AND m2.parent_id IS NOT NULL
		  )
		  AND (SELECT COUNT(*) FROM messages r WHERE r.parent_id = p.id AND r.deleted_at IS NULL) > 0
		ORDER BY last_activity DESC
		LIMIT ?
	`, userID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []ThreadSummary
	for rows.Next() {
		var t ThreadSummary
		var role string
		var content string
		if err := rows.Scan(
			&t.ParentID, &t.ChannelID, &t.ChannelName,
			&t.AuthorUsername, &t.AuthorDisplay, &role,
			&content, &t.ReplyCount, &t.LastActivityAt,
		); err != nil {
			return nil, err
		}
		t.AuthorIsBot = role == "bot"
		if len(content) > 120 {
			t.ContentPreview = content[:120] + "..."
		} else {
			t.ContentPreview = content
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
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

// extractMentions parses @username patterns from message content.
func extractMentions(content string) []string {
	matches := mentionRe.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]bool)
	var mentions []string
	for _, m := range matches {
		name := m[1]
		if !seen[name] {
			seen[name] = true
			mentions = append(mentions, name)
		}
	}
	return mentions
}

// extractURLs finds up to maxPreviews URLs in message content.
func extractURLs(content string) []string {
	matches := urlRe.FindAllString(content, maxPreviews)
	if len(matches) == 0 {
		return nil
	}
	return matches
}

// fetchLinkPreviews extracts URLs and fetches OG metadata for each.
func fetchLinkPreviews(content string) []LinkPreview {
	urls := extractURLs(content)
	if len(urls) == 0 {
		return nil
	}
	var previews []LinkPreview
	for _, u := range urls {
		lp := fetchOGMetadata(u)
		if lp != nil {
			lp.URL = u
			previews = append(previews, *lp)
		}
	}
	return previews
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
