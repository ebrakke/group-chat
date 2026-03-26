// Package messages handles chat messages and thread replies.
package messages

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
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
	CreatedAt    string        `json:"createdAt"`
	Username     string        `json:"username"`
	DisplayName  string        `json:"displayName"`
	ReplyCount        int                `json:"replyCount,omitempty"`
	ReplyParticipants []ReplyParticipant `json:"replyParticipants,omitempty"`
	IsBot             bool               `json:"isBot,omitempty"`
	AvatarURL     string        `json:"avatarUrl,omitempty"`
	Role          string        `json:"role,omitempty"`
	UserCreatedAt string        `json:"userCreatedAt,omitempty"`
	Mentions      []string      `json:"mentions,omitempty"`
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

type ReplyParticipant struct {
	UserID      int64  `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
}

type Service struct {
	db         *db.DB
	notifyFunc func(*Message, string) // callback for notifications
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// SetNotifyFunc sets the callback for sending notifications.
func (s *Service) SetNotifyFunc(fn func(*Message, string)) {
	s.notifyFunc = fn
}

// Create creates a new top-level message in a channel.
func (s *Service) Create(channelID, userID int64, content string) (*Message, error) {
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
		"INSERT INTO messages (channel_id, user_id, content, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		channelID, userID, content, mentionsJSON, previewsJSON, now,
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
func (s *Service) CreateReply(parentID, userID int64, content string) (*Message, error) {
	// Look up parent to get channel
	parent, err := s.GetByID(parentID)
	if err != nil {
		return nil, fmt.Errorf("parent not found: %w", err)
	}
	if parent.ParentID != nil {
		return nil, errors.New("cannot reply to a reply (threads are one level deep)")
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
		"INSERT INTO messages (channel_id, user_id, parent_id, content, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		parent.ChannelID, userID, parentID, content, mentionsJSON, previewsJSON, now,
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
	var previewsJSON sql.NullString
	var editedAt sql.NullString
	var deletedAt sql.NullString
	var role string
	var avatarFileID sql.NullInt64
	err := s.db.QueryRow(`
		SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.link_previews, m.created_at,
		       m.edited_at, m.deleted_at,
		       u.username, u.display_name, u.role, u.profile_picture_id, u.created_at,
		       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.id = ?
	`, id).Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &previewsJSON, &m.CreatedAt,
		&editedAt, &deletedAt,
		&m.Username, &m.DisplayName, &role, &avatarFileID, &m.UserCreatedAt, &m.ReplyCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	m.IsBot = role == "bot"
	m.Role = role
	if avatarFileID.Valid {
		m.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
	}
	m.Mentions = extractMentions(m.Content)
	if parentID.Valid {
		m.ParentID = &parentID.Int64
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
			SELECT m.id, m.channel_id, m.user_id, m.content, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role, u.profile_picture_id, u.created_at,
			       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.deleted_at IS NULL AND m.id < ?
			ORDER BY m.id DESC LIMIT ?
		`, channelID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.content, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role, u.profile_picture_id, u.created_at,
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
		var previewsJSON sql.NullString
		var editedAt sql.NullString
		var deletedAt sql.NullString
		var role string
		var avatarFileID sql.NullInt64
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Content, &previewsJSON, &m.CreatedAt,
			&editedAt, &deletedAt,
			&m.Username, &m.DisplayName, &role, &avatarFileID, &m.UserCreatedAt, &m.ReplyCount); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		m.Role = role
		if avatarFileID.Valid {
			m.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
		}
		m.Mentions = extractMentions(m.Content)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fetch reply participants for messages that have replies
	var parentIDs []int64
	for i := range msgs {
		if msgs[i].ReplyCount > 0 {
			parentIDs = append(parentIDs, msgs[i].ID)
		}
	}
	if len(parentIDs) > 0 {
		participants, err := s.replyParticipants(parentIDs)
		if err == nil {
			for i := range msgs {
				if p, ok := participants[msgs[i].ID]; ok {
					msgs[i].ReplyParticipants = p
				}
			}
		}
	}

	return msgs, nil
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
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role, u.profile_picture_id, u.created_at
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id = ? AND m.deleted_at IS NULL AND m.id < ?
			ORDER BY m.id ASC LIMIT ?
		`, parentID, before, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.link_previews, m.created_at,
			       m.edited_at, m.deleted_at,
			       u.username, u.display_name, u.role, u.profile_picture_id, u.created_at
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
		var previewsJSON sql.NullString
		var editedAt sql.NullString
		var deletedAt sql.NullString
		var role string
		var avatarFileID sql.NullInt64
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &previewsJSON, &m.CreatedAt,
			&editedAt, &deletedAt,
			&m.Username, &m.DisplayName, &role, &avatarFileID, &m.UserCreatedAt); err != nil {
			return nil, err
		}
		m.IsBot = role == "bot"
		m.Role = role
		if avatarFileID.Valid {
			m.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
		}
		m.Mentions = extractMentions(m.Content)
		if parentID.Valid {
			m.ParentID = &parentID.Int64
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

// replyParticipants returns up to 4 distinct users who replied to the given message IDs.
// Returns a map from parent message ID to participant slice.
func (s *Service) replyParticipants(parentIDs []int64) (map[int64][]ReplyParticipant, error) {
	if len(parentIDs) == 0 {
		return nil, nil
	}

	// Build placeholders
	placeholders := make([]string, len(parentIDs))
	args := make([]interface{}, len(parentIDs))
	for i, id := range parentIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT parent_id, user_id, username, display_name, profile_picture_id
		FROM (
			SELECT m.parent_id, u.id as user_id, u.username, u.display_name, u.profile_picture_id,
			       ROW_NUMBER() OVER (PARTITION BY m.parent_id, u.id ORDER BY m.id ASC) as rn_user,
			       MIN(m.id) OVER (PARTITION BY m.parent_id, u.id) as first_reply_id
			FROM messages m
			JOIN users u ON m.user_id = u.id
			WHERE m.parent_id IN (%s) AND m.deleted_at IS NULL
		) sub
		WHERE rn_user = 1
		ORDER BY parent_id, first_reply_id ASC
	`, strings.Join(placeholders, ","))

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64][]ReplyParticipant)
	for rows.Next() {
		var parentID int64
		var p ReplyParticipant
		var avatarFileID sql.NullInt64
		if err := rows.Scan(&parentID, &p.UserID, &p.Username, &p.DisplayName, &avatarFileID); err != nil {
			return nil, err
		}
		if avatarFileID.Valid {
			p.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
		}
		if len(result[parentID]) < 4 {
			result[parentID] = append(result[parentID], p)
		}
	}
	return result, rows.Err()
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

// BackfillLinkPreviews finds messages containing YouTube URLs with no link
// previews and fetches them. Intended to run in a background goroutine on
// startup to fix messages created before oEmbed support was added.
func (s *Service) BackfillLinkPreviews() {
	// Collect all candidates first, then close rows promptly.
	// SQLite is configured with MaxOpenConns(1), so holding the connection
	// open during slow network fetches would starve all other DB operations.
	type candidate struct {
		id      int64
		content string
	}

	rows, err := s.db.Query(
		`SELECT id, content FROM messages
		 WHERE deleted_at IS NULL
		   AND (link_previews IS NULL OR link_previews = 'null')
		   AND (content LIKE '%youtube.com/watch%'
		     OR content LIKE '%youtu.be/%'
		     OR content LIKE '%youtube.com/shorts%')`,
	)
	if err != nil {
		return
	}

	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.content); err != nil {
			continue
		}
		candidates = append(candidates, c)
	}
	rows.Close()

	for _, c := range candidates {
		previews := fetchLinkPreviews(c.content)
		if len(previews) == 0 {
			continue
		}
		previewsJSON, _ := json.Marshal(previews)
		s.db.Exec("UPDATE messages SET link_previews = ? WHERE id = ?", previewsJSON, c.id)
	}
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

