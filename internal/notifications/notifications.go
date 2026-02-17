// Package notifications handles notification delivery via webhooks.
package notifications

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

// Service handles notification delivery via webhooks.
type Service struct {
	db *db.DB
}

// Settings represents user notification preferences.
type Settings struct {
	UserID              int64  `json:"userId"`
	WebhookURL          string `json:"webhookUrl"`
	BaseURL             string `json:"baseUrl"`
	NotifyMentions      bool   `json:"notifyMentions"`
	NotifyThreadReplies bool   `json:"notifyThreadReplies"`
	NotifyAllMessages   bool   `json:"notifyAllMessages"`
	CreatedAt           string `json:"createdAt"`
	UpdatedAt           string `json:"updatedAt"`
}

// NewService creates a new notification service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

var ErrSettingsNotFound = errors.New("notification settings not found")

// GetSettings retrieves notification settings for a user.
func (s *Service) GetSettings(userID int64) (*Settings, error) {
	var settings Settings
	err := s.db.QueryRow(`
		SELECT user_id, webhook_url, base_url, notify_mentions, notify_thread_replies, notify_all_messages, created_at, updated_at
		FROM user_notification_settings
		WHERE user_id = ?
	`, userID).Scan(
		&settings.UserID,
		&settings.WebhookURL,
		&settings.BaseURL,
		&settings.NotifyMentions,
		&settings.NotifyThreadReplies,
		&settings.NotifyAllMessages,
		&settings.CreatedAt,
		&settings.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrSettingsNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query settings: %w", err)
	}
	return &settings, nil
}

// UpdateSettings creates or updates notification settings for a user.
func (s *Service) UpdateSettings(userID int64, settings *Settings) error {
	now := time.Now().UTC().Format(time.RFC3339)

	// Try update first
	result, err := s.db.Exec(`
		UPDATE user_notification_settings
		SET webhook_url = ?, base_url = ?, notify_mentions = ?, notify_thread_replies = ?, notify_all_messages = ?, updated_at = ?
		WHERE user_id = ?
	`, settings.WebhookURL, settings.BaseURL, settings.NotifyMentions, settings.NotifyThreadReplies, settings.NotifyAllMessages, now, userID)
	if err != nil {
		return fmt.Errorf("update settings: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		// Insert new settings
		_, err = s.db.Exec(`
			INSERT INTO user_notification_settings (user_id, webhook_url, base_url, notify_mentions, notify_thread_replies, notify_all_messages, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, userID, settings.WebhookURL, settings.BaseURL, settings.NotifyMentions, settings.NotifyThreadReplies, settings.NotifyAllMessages, now, now)
		if err != nil {
			return fmt.Errorf("insert settings: %w", err)
		}
	}

	return nil
}
