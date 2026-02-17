// Package notifications handles notification delivery via webhooks.
package notifications

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
)

// Service handles notification delivery via webhooks.
type Service struct {
	db        *db.DB
	providers map[string]Provider
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

var httpClient = &http.Client{
	Timeout: 5 * time.Second,
}

// NewService creates a new notification service.
func NewService(database *db.DB) *Service {
	return &Service{
		db:        database,
		providers: make(map[string]Provider),
	}
}

// RegisterProvider adds a notification provider to the registry
func (s *Service) RegisterProvider(name string, provider Provider) {
	s.providers[name] = provider
}

// GetAvailableProviders returns list of properly configured providers
func (s *Service) GetAvailableProviders() []string {
	var available []string
	for name, provider := range s.providers {
		if provider.ValidateConfig() == nil {
			available = append(available, name)
		}
	}
	return available
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

// sendWebhook sends a JSON payload to a webhook URL via HTTP POST.
func (s *Service) sendWebhook(webhookURL string, payload map[string]interface{}) error {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// Send checks notification rules and sends webhooks for a new message.
func (s *Service) Send(msg *messages.Message, channelName string) error {
	// Get all users in the channel
	rows, err := s.db.Query(`
		SELECT u.id, u.username
		FROM users u
		JOIN channel_members cm ON u.id = cm.user_id
		WHERE cm.channel_id = ?
	`, msg.ChannelID)
	if err != nil {
		return fmt.Errorf("query channel members: %w", err)
	}
	defer rows.Close()

	type user struct {
		id       int64
		username string
	}
	var users []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.id, &u.username); err != nil {
			return err
		}
		users = append(users, u)
	}

	// For each user, check if they should be notified
	for _, u := range users {
		// Don't notify the message author
		if u.id == msg.UserID {
			continue
		}

		// Get user's notification settings
		settings, err := s.GetSettings(u.id)
		if err != nil {
			// No settings configured, skip
			continue
		}

		if settings.WebhookURL == "" {
			continue
		}

		// Check notification rules
		var shouldNotify bool
		var notificationType string
		var threadContext string

		// Check for mention
		if settings.NotifyMentions && s.isMentioned(u.username, msg.Mentions) {
			shouldNotify = true
			notificationType = "mention"
		}

		// Check for thread reply
		if !shouldNotify && settings.NotifyThreadReplies && msg.ParentID != nil {
			// Check if user participated in this thread
			participated, err := s.userParticipatedInThread(u.id, *msg.ParentID)
			if err == nil && participated {
				// Check if thread is muted
				muted, err := s.IsThreadMuted(u.id, *msg.ParentID)
				if err == nil && !muted {
					shouldNotify = true
					notificationType = "thread_reply"
					// Get thread context (parent message preview)
					threadContext = s.getThreadContext(*msg.ParentID)
				}
			}
		}

		// Check for all messages
		if !shouldNotify && settings.NotifyAllMessages {
			shouldNotify = true
			notificationType = "all_messages"
		}

		if shouldNotify {
			// Send webhook asynchronously
			go s.sendNotification(msg, channelName, threadContext, notificationType, settings)
		}
	}

	return nil
}

// isMentioned checks if username is in the mentions list (case-insensitive).
func (s *Service) isMentioned(username string, mentions []string) bool {
	for _, mention := range mentions {
		if strings.EqualFold(username, mention) {
			return true
		}
	}
	return false
}

// userParticipatedInThread checks if a user authored or replied to a thread.
func (s *Service) userParticipatedInThread(userID, parentID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*)
		FROM messages
		WHERE (id = ? AND user_id = ?)
		   OR (parent_id = ? AND user_id = ?)
	`, parentID, userID, parentID, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// getThreadContext retrieves a preview of the parent message for thread notifications.
func (s *Service) getThreadContext(parentID int64) string {
	var content string
	err := s.db.QueryRow("SELECT content FROM messages WHERE id = ?", parentID).Scan(&content)
	if err != nil {
		return ""
	}
	if len(content) > 120 {
		return "Re: " + content[:120] + "..."
	}
	return "Re: " + content
}

// sendNotification sends a webhook notification (called in goroutine).
func (s *Service) sendNotification(msg *messages.Message, channelName, threadContext, notificationType string, settings *Settings) {
	payload := s.buildPayload(msg, channelName, threadContext, notificationType, settings)
	if err := s.sendWebhook(settings.WebhookURL, payload); err != nil {
		log.Printf("Failed to send webhook notification: %v", err)
	}
}
