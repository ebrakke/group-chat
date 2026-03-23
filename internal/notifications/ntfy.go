package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// generateNtfyTopic creates a unique, unguessable topic name for a user.
func generateNtfyTopic() string {
	return "relay-" + uuid.New().String()
}

// ntfyPayload is the JSON body sent to the ntfy HTTP API.
type ntfyPayload struct {
	Topic   string   `json:"topic"`
	Title   string   `json:"title"`
	Message string   `json:"message"`
	Click   string   `json:"click,omitempty"`
	Icon    string   `json:"icon,omitempty"`
	Tags    []string `json:"tags,omitempty"`
}

var ntfyClient = &http.Client{Timeout: 10 * time.Second}

// publishNtfy sends a notification to a specific ntfy topic.
func publishNtfy(serverURL, publishToken, topic string, payload Payload, iconURL string) error {
	body := ntfyPayload{
		Topic:   topic,
		Title:   payload.Title,
		Message: fmt.Sprintf("%s: %s", payload.Sender, payload.Message),
		Click:   payload.URL,
		Icon:    iconURL,
		Tags:    []string{"speech_balloon"},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("ntfy: marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", serverURL, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("ntfy: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if publishToken != "" {
		req.Header.Set("Authorization", "Bearer "+publishToken)
	}

	resp, err := ntfyClient.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		slog.Error("ntfy publish failed",
			"status", resp.StatusCode,
			"topic", topic,
			"server", serverURL,
			"response", string(respBody),
		)
		return fmt.Errorf("ntfy: server returned %d", resp.StatusCode)
	}

	slog.Debug("ntfy publish succeeded", "topic", topic, "title", payload.Title)
	return nil
}

// sendNtfy sends a notification via ntfy if enabled and the user has a topic.
func (s *Service) sendNtfy(userID int64, payload Payload) {
	enabled, err := s.GetAppSetting("ntfy_enabled")
	if err != nil || enabled != "true" {
		return
	}

	serverURL, err := s.GetAppSetting("ntfy_server_url")
	if err != nil || serverURL == "" {
		return
	}

	publishToken, _ := s.GetAppSetting("ntfy_publish_token")

	// Get user's ntfy topic
	var topic string
	err = s.db.QueryRow("SELECT ntfy_topic FROM users WHERE id = ?", userID).Scan(&topic)
	if err != nil || topic == "" {
		return
	}

	// Build icon URL from base URL
	baseURL := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		baseURL = configuredURL
	}
	iconURL := baseURL + "/icon-192.png"

	if err := publishNtfy(serverURL, publishToken, topic, payload, iconURL); err != nil {
		slog.Error("ntfy: failed to send notification",
			"user_id", userID,
			"topic", topic,
			"error", err,
		)
	}
}

// GetNtfyTopic returns the ntfy topic for a user, generating one if it doesn't exist.
func (s *Service) GetNtfyTopic(userID int64) (string, error) {
	var topic *string
	err := s.db.QueryRow("SELECT ntfy_topic FROM users WHERE id = ?", userID).Scan(&topic)
	if err != nil {
		return "", fmt.Errorf("ntfy: query user topic: %w", err)
	}

	if topic != nil && *topic != "" {
		return *topic, nil
	}

	// Generate and store a new topic
	newTopic := generateNtfyTopic()
	_, err = s.db.Exec("UPDATE users SET ntfy_topic = ? WHERE id = ?", newTopic, userID)
	if err != nil {
		return "", fmt.Errorf("ntfy: store topic: %w", err)
	}

	return newTopic, nil
}

// RegenerateNtfyTopic creates a new topic for a user, invalidating the old one.
func (s *Service) RegenerateNtfyTopic(userID int64) (string, error) {
	newTopic := generateNtfyTopic()
	_, err := s.db.Exec("UPDATE users SET ntfy_topic = ? WHERE id = ?", newTopic, userID)
	if err != nil {
		return "", fmt.Errorf("ntfy: regenerate topic: %w", err)
	}
	return newTopic, nil
}

// EnsureAllNtfyTopics generates ntfy topics for all users who don't have one.
func (s *Service) EnsureAllNtfyTopics() error {
	// Collect IDs first, then close rows before doing writes.
	// With MaxOpenConns(1), holding rows open while calling Exec deadlocks.
	rows, err := s.db.Query("SELECT id FROM users WHERE ntfy_topic IS NULL OR ntfy_topic = ''")
	if err != nil {
		return fmt.Errorf("ntfy: query users without topics: %w", err)
	}

	var userIDs []int64
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			rows.Close()
			return err
		}
		userIDs = append(userIDs, userID)
	}
	rows.Close()

	for _, userID := range userIDs {
		topic := generateNtfyTopic()
		if _, err := s.db.Exec("UPDATE users SET ntfy_topic = ? WHERE id = ?", topic, userID); err != nil {
			return fmt.Errorf("ntfy: store topic for user %d: %w", userID, err)
		}
	}
	return nil
}

// SendTestNtfy sends a test notification via ntfy.
func (s *Service) SendTestNtfy(userID int64, payload Payload) {
	enabled, err := s.GetAppSetting("ntfy_enabled")
	if err != nil || enabled != "true" {
		return
	}

	serverURL, _ := s.GetAppSetting("ntfy_server_url")
	publishToken, _ := s.GetAppSetting("ntfy_publish_token")

	var topic string
	err = s.db.QueryRow("SELECT ntfy_topic FROM users WHERE id = ?", userID).Scan(&topic)
	if err != nil || topic == "" {
		return
	}

	baseURL := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		baseURL = configuredURL
	}

	publishNtfy(serverURL, publishToken, topic, payload, baseURL+"/icon-192.png")
}
