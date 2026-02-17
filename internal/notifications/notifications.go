// Package notifications handles notification delivery via webhooks.
package notifications

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
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

// MuteThread mutes a thread for a user.
func (s *Service) MuteThread(userID, messageID int64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO thread_mutes (user_id, message_id, created_at)
		VALUES (?, ?, ?)
	`, userID, messageID, now)
	if err != nil {
		return fmt.Errorf("mute thread: %w", err)
	}
	return nil
}

// UnmuteThread unmutes a thread for a user.
func (s *Service) UnmuteThread(userID, messageID int64) error {
	_, err := s.db.Exec(`
		DELETE FROM thread_mutes
		WHERE user_id = ? AND message_id = ?
	`, userID, messageID)
	if err != nil {
		return fmt.Errorf("unmute thread: %w", err)
	}
	return nil
}

// IsThreadMuted checks if a user has muted a thread.
func (s *Service) IsThreadMuted(userID, messageID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM thread_mutes
		WHERE user_id = ? AND message_id = ?
	`, userID, messageID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check thread mute: %w", err)
	}
	return count > 0, nil
}

// buildPayload constructs the JSON payload for a webhook notification.
func (s *Service) buildPayload(msg *messages.Message, channelName, threadContext, notificationType string, settings *Settings) map[string]interface{} {
	// Truncate message if too long
	content := msg.Content
	if len(content) > 500 {
		content = content[:500] + "..."
	}

	// Build title based on notification type
	var title string
	switch notificationType {
	case "mention":
		title = "@you mentioned in #" + channelName
	case "thread_reply":
		title = "New reply in #" + channelName
	case "all_messages":
		title = "New message in #" + channelName
	default:
		title = "New message in #" + channelName
	}

	// Build deep link URL
	url := settings.BaseURL + "/#/channel/" + fmt.Sprintf("%d", msg.ChannelID)
	if msg.ParentID != nil {
		url += "/thread/" + fmt.Sprintf("%d", *msg.ParentID)
	}

	payload := map[string]interface{}{
		"title":            title,
		"message":          content,
		"sender":           msg.DisplayName,
		"channel":          channelName,
		"channelId":        msg.ChannelID,
		"url":              url,
		"timestamp":        msg.CreatedAt,
		"notificationType": notificationType,
	}

	if threadContext != "" {
		payload["threadContext"] = threadContext
	} else {
		payload["threadContext"] = nil
	}

	return payload
}
