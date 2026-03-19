// Package notifications handles notification delivery via pluggable providers.
package notifications

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
)

// Service handles notification delivery via pluggable providers.
type Service struct {
	db        *db.DB
	providers map[string]Provider
	baseURL   string
}

// Settings represents user notification preferences.
type Settings struct {
	UserID              int64  `json:"userId"`
	Provider            string `json:"provider"`
	ProviderConfig      string `json:"providerConfig"` // JSON string
	NotifyMentions      bool   `json:"notifyMentions"`
	NotifyThreadReplies bool   `json:"notifyThreadReplies"`
	NotifyAllMessages   bool   `json:"notifyAllMessages"`
}

// NewService creates a new notification service.
func NewService(database *db.DB, baseURL string) *Service {
	return &Service{
		db:        database,
		providers: make(map[string]Provider),
		baseURL:   baseURL,
	}
}

// RegisterProvider adds a notification provider to the registry
func (s *Service) RegisterProvider(name string, provider Provider) {
	s.providers[name] = provider
}

// UnregisterProvider removes a notification provider from the registry
func (s *Service) UnregisterProvider(name string) {
	delete(s.providers, name)
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
		SELECT user_id, provider, provider_config,
		       notify_mentions, notify_thread_replies, notify_all_messages
		FROM user_notification_settings
		WHERE user_id = ?
	`, userID).Scan(
		&settings.UserID,
		&settings.Provider,
		&settings.ProviderConfig,
		&settings.NotifyMentions,
		&settings.NotifyThreadReplies,
		&settings.NotifyAllMessages,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

// UpdateSettings creates or updates notification settings for a user.
func (s *Service) UpdateSettings(userID int64, settings *Settings) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO user_notification_settings
		(user_id, provider, provider_config, notify_mentions, notify_thread_replies, notify_all_messages, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, settings.Provider, settings.ProviderConfig,
		settings.NotifyMentions, settings.NotifyThreadReplies, settings.NotifyAllMessages, now, now)
	return err
}

// GetAppSettings retrieves all app settings
func (s *Service) GetAppSettings() (map[string]string, error) {
	rows, err := s.db.Query("SELECT key, value FROM app_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, rows.Err()
}

// UpdateAppSettings updates app settings
func (s *Service) UpdateAppSettings(settings map[string]string) error {
	for key, value := range settings {
		_, err := s.db.Exec(
			"INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
			key, value,
		)
		if err != nil {
			return fmt.Errorf("update setting %s: %w", key, err)
		}
	}
	return nil
}

// GetAppSetting retrieves a single app setting
func (s *Service) GetAppSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow("SELECT value FROM app_settings WHERE key = ?", key).Scan(&value)
	if err != nil {
		return "", err
	}
	return value, nil
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

// buildPayload constructs the notification payload.
func (s *Service) buildPayload(msg *messages.Message, channelName string) Payload {
	// Truncate message if too long
	content := msg.Content
	if len(content) > 500 {
		content = content[:500] + "..."
	}

	// Use configured base URL from settings, fallback to default
	baseURL := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		baseURL = configuredURL
	}

	// Build deep link URL
	url := baseURL + "/#/channel/" + fmt.Sprintf("%d", msg.ChannelID)
	if msg.ParentID != nil {
		url += "/thread/" + fmt.Sprintf("%d", *msg.ParentID)
	}

	return Payload{
		Title:     "New message in #" + channelName,
		Message:   content,
		Sender:    msg.DisplayName,
		Channel:   channelName,
		ChannelID: msg.ChannelID,
		URL:       url,
		Timestamp: msg.CreatedAt,
	}
}


// Send checks notification rules and sends notifications for a new message.
func (s *Service) Send(msg *messages.Message, channelName string) error {
	// Get all users except the message author
	// Since all users can see all channels, we don't filter by channel membership
	rows, err := s.db.Query(`
		SELECT id FROM users WHERE id != ? AND role != 'bot'
	`, msg.UserID)
	if err != nil {
		return fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var userIDs []int64
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		userIDs = append(userIDs, userID)
	}

	// Send notification to each user asynchronously
	for _, userID := range userIDs {
		go s.sendToUser(userID, msg, channelName)
	}

	return nil
}

// GetChannelNotificationLevel returns the notification level for a user+channel.
// Returns "mentions" (the default) if no explicit setting exists.
func (s *Service) GetChannelNotificationLevel(userID, channelID int64) string {
	var level string
	err := s.db.QueryRow(
		"SELECT level FROM channel_notification_settings WHERE user_id = ? AND channel_id = ?",
		userID, channelID,
	).Scan(&level)
	if err != nil {
		return "mentions" // default
	}
	return level
}

// SetChannelNotificationLevel sets the notification level for a user+channel.
func (s *Service) SetChannelNotificationLevel(userID, channelID int64, level string) error {
	switch level {
	case "everything", "mentions", "threads", "nothing":
		// valid
	default:
		return fmt.Errorf("invalid notification level: %s", level)
	}
	_, err := s.db.Exec(
		`INSERT INTO channel_notification_settings (user_id, channel_id, level) VALUES (?, ?, ?)
		 ON CONFLICT(user_id, channel_id) DO UPDATE SET level = excluded.level`,
		userID, channelID, level,
	)
	return err
}

// sendToUser sends a notification to a specific user.
func (s *Service) sendToUser(userID int64, msg *messages.Message, channelName string) {
	if !s.shouldNotify(userID, msg) {
		return
	}

	payload := s.buildPayload(msg, channelName)

	// Try web push subscriptions first
	subs, _ := s.GetWebPushSubscriptions(userID)
	if len(subs) > 0 {
		log.Printf("Sending web push to user %d (%d subscriptions)", userID, len(subs))
		s.SendWebPush(subs, payload)
		return
	}
	log.Printf("No web push subscriptions for user %d, skipping push", userID)

	// Fall back to configured provider (webhook)
	settings, err := s.GetSettings(userID)
	if err != nil || settings == nil || settings.Provider == "" {
		return
	}
	provider, ok := s.providers[settings.Provider]
	if !ok {
		return
	}

	var providerConfig map[string]string
	json.Unmarshal([]byte(settings.ProviderConfig), &providerConfig)

	recipient := Recipient{
		UserID:      userID,
		ProviderKey: providerConfig["key"],
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := provider.Send(ctx, recipient, payload); err != nil {
		log.Printf("Notification send error (user %d, provider %s): %v", userID, settings.Provider, err)
	}
}

// shouldNotify checks if a user should receive a notification for a message.
func (s *Service) shouldNotify(userID int64, msg *messages.Message) bool {
	level := s.GetChannelNotificationLevel(userID, msg.ChannelID)

	var username string
	s.db.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)

	switch level {
	case "everything":
		return true
	case "mentions":
		return s.isMentioned(username, msg.Mentions)
	case "threads":
		if msg.ParentID == nil {
			return false
		}
		participated, err := s.userParticipatedInThread(userID, *msg.ParentID)
		if err != nil || !participated {
			return false
		}
		muted, err := s.IsThreadMuted(userID, *msg.ParentID)
		return err == nil && !muted
	case "nothing":
		return false
	default:
		return false
	}
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
