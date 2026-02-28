// Package search provides full-text search over messages using SQLite FTS5.
package search

import (
	"database/sql"

	"github.com/ebrakke/relay-chat/internal/db"
)

// Result represents a single search hit with message and context info.
type Result struct {
	ID          int64  `json:"id"`
	ChannelID   int64  `json:"channelId"`
	ChannelName string `json:"channelName"`
	UserID      int64  `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Content     string `json:"content"`
	CreatedAt   string `json:"createdAt"`
	ParentID    *int64 `json:"parentId,omitempty"`
}

// Service provides full-text search over messages.
type Service struct {
	db *db.DB
}

// NewService creates a new search service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// Search performs a full-text search and returns matching messages.
func (s *Service) Search(query string, limit int) ([]Result, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id, c.name, m.user_id, u.username, u.display_name,
		       m.content, m.created_at, m.parent_id
		FROM messages m
		JOIN messages_fts mf ON m.id = mf.rowid
		JOIN users u ON m.user_id = u.id
		JOIN channels c ON m.channel_id = c.id
		WHERE messages_fts MATCH ?
		AND m.deleted_at IS NULL
		ORDER BY mf.rank
		LIMIT ?
	`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var r Result
		var parentID sql.NullInt64
		if err := rows.Scan(&r.ID, &r.ChannelID, &r.ChannelName, &r.UserID,
			&r.Username, &r.DisplayName, &r.Content, &r.CreatedAt, &parentID); err != nil {
			return nil, err
		}
		if parentID.Valid {
			r.ParentID = &parentID.Int64
		}
		results = append(results, r)
	}
	return results, rows.Err()
}
