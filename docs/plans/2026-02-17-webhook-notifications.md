# Webhook Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mobile notifications via user-configured webhooks (Pushover, ntfy.sh, custom endpoints) with smart defaults and deep links.

**Architecture:** Backend sends HTTP POST to user-configured webhook URLs when messages match notification rules (mentions, thread replies, all messages). Notifications include deep links to open PWA to specific channel/thread. Thread muting supported.

**Tech Stack:** Go (stdlib net/http), SQLite (modernc.org/sqlite), Vanilla JS frontend

---

## Task 1: Database Migration for Notification Tables

**Files:**
- Create: `internal/db/migrations/007_notifications.sql`

**Step 1: Write migration file**

Create the migration file with both tables and indexes:

```sql
-- User notification settings
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    base_url TEXT NOT NULL,
    notify_mentions BOOLEAN DEFAULT 1,
    notify_thread_replies BOOLEAN DEFAULT 1,
    notify_all_messages BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Thread mutes
CREATE TABLE thread_mutes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, message_id)
);

-- Indexes
CREATE INDEX idx_thread_mutes_user_id ON thread_mutes(user_id);
CREATE INDEX idx_thread_mutes_message_id ON thread_mutes(message_id);
```

**Step 2: Test migration**

Run: `go test ./internal/db/... -v`
Expected: Migration runs successfully on fresh database

**Step 3: Commit**

```bash
git add internal/db/migrations/007_notifications.sql
git commit -m "feat: add notification settings and thread mutes tables

Add user_notification_settings and thread_mutes tables with indexes.
Migration includes webhook URL, base URL for deep links, and
per-user notification preferences.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 2: Notifications Service - Core Types and Constructor

**Files:**
- Create: `internal/notifications/notifications.go`
- Create: `internal/notifications/notifications_test.go`

**Step 1: Write failing test for NewService**

```go
package notifications

import (
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func TestNewService(t *testing.T) {
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	svc := NewService(database)
	if svc == nil {
		t.Fatal("NewService returned nil")
	}
	if svc.db == nil {
		t.Fatal("service db is nil")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: NewService"

**Step 3: Write minimal implementation**

```go
package notifications

import (
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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add notifications service with core types

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 3: Notifications Service - Get/Update Settings

**Files:**
- Modify: `internal/notifications/notifications.go`
- Modify: `internal/notifications/notifications_test.go`

**Step 1: Write failing tests**

Add to `notifications_test.go`:

```go
func TestGetSettings_NotFound(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	_, err := svc.GetSettings(999)
	if err == nil {
		t.Fatal("expected error for non-existent settings")
	}
}

func TestUpdateSettings(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Create a test user first
	_, err := database.Exec("INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
		"testuser", "Test User", "hash", "member")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	settings := &Settings{
		UserID:              1,
		WebhookURL:          "https://example.com/webhook",
		BaseURL:             "https://chat.example.com",
		NotifyMentions:      true,
		NotifyThreadReplies: true,
		NotifyAllMessages:   false,
	}

	err = svc.UpdateSettings(1, settings)
	if err != nil {
		t.Fatalf("UpdateSettings failed: %v", err)
	}

	// Verify
	got, err := svc.GetSettings(1)
	if err != nil {
		t.Fatalf("GetSettings failed: %v", err)
	}
	if got.WebhookURL != settings.WebhookURL {
		t.Errorf("webhook_url = %q, want %q", got.WebhookURL, settings.WebhookURL)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: GetSettings"

**Step 3: Implement GetSettings and UpdateSettings**

Add to `notifications.go`:

```go
import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add Get/UpdateSettings for notifications

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 4: Notifications Service - Thread Muting

**Files:**
- Modify: `internal/notifications/notifications.go`
- Modify: `internal/notifications/notifications_test.go`

**Step 1: Write failing tests**

Add to `notifications_test.go`:

```go
func TestThreadMuting(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Create user and channel
	database.Exec("INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))", "user1", "User 1", "hash", "member")
	database.Exec("INSERT INTO channels (name, group_id, created_at) VALUES (?, ?, datetime('now'))", "general", "group1")
	database.Exec("INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))", 1, 1, "test message")

	// Initially not muted
	muted, err := svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if muted {
		t.Error("thread should not be muted initially")
	}

	// Mute thread
	err = svc.MuteThread(1, 1)
	if err != nil {
		t.Fatalf("MuteThread failed: %v", err)
	}

	// Verify muted
	muted, err = svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if !muted {
		t.Error("thread should be muted")
	}

	// Unmute thread
	err = svc.UnmuteThread(1, 1)
	if err != nil {
		t.Fatalf("UnmuteThread failed: %v", err)
	}

	// Verify unmuted
	muted, err = svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if muted {
		t.Error("thread should not be muted after unmute")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: MuteThread"

**Step 3: Implement thread muting methods**

Add to `notifications.go`:

```go
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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add thread muting/unmuting

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 5: Notifications Service - Webhook Payload Builder

**Files:**
- Modify: `internal/notifications/notifications.go`
- Modify: `internal/notifications/notifications_test.go`

**Step 1: Write failing test**

Add to `notifications_test.go`:

```go
import (
	"github.com/ebrakke/relay-chat/internal/messages"
)

func TestBuildPayload(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	msg := &messages.Message{
		ID:          123,
		ChannelID:   1,
		UserID:      2,
		Content:     "@alice check this out",
		DisplayName: "Bob",
		Username:    "bob",
	}

	settings := &Settings{
		BaseURL: "https://chat.example.com",
	}

	payload := svc.buildPayload(msg, "general", "", "mention", settings)

	if payload["message"] != "@alice check this out" {
		t.Errorf("message = %q, want %q", payload["message"], "@alice check this out")
	}
	if payload["sender"] != "Bob" {
		t.Errorf("sender = %q, want %q", payload["sender"], "Bob")
	}
	if payload["channel"] != "general" {
		t.Errorf("channel = %q, want %q", payload["channel"], "general")
	}
	if payload["notificationType"] != "mention" {
		t.Errorf("notificationType = %q, want %q", payload["notificationType"], "mention")
	}
	expectedURL := "https://chat.example.com/#/channel/1"
	if payload["url"] != expectedURL {
		t.Errorf("url = %q, want %q", payload["url"], expectedURL)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: buildPayload"

**Step 3: Implement buildPayload**

Add to `notifications.go`:

```go
import (
	"github.com/ebrakke/relay-chat/internal/messages"
)

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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add webhook payload builder

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 6: Notifications Service - Send Webhook

**Files:**
- Modify: `internal/notifications/notifications.go`
- Modify: `internal/notifications/notifications_test.go`

**Step 1: Write test with mock HTTP server**

Add to `notifications_test.go`:

```go
import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
)

func TestSendWebhook(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Mock webhook server
	var receivedPayload map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("method = %s, want POST", r.Method)
		}
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	payload := map[string]interface{}{
		"title":   "Test",
		"message": "Test message",
	}

	err := svc.sendWebhook(server.URL, payload)
	if err != nil {
		t.Fatalf("sendWebhook failed: %v", err)
	}

	if receivedPayload["title"] != "Test" {
		t.Errorf("received title = %v, want Test", receivedPayload["title"])
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: sendWebhook"

**Step 3: Implement sendWebhook**

Add to `notifications.go`:

```go
import (
	"bytes"
	"encoding/json"
	"net/http"
)

var httpClient = &http.Client{
	Timeout: 5 * time.Second,
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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add webhook HTTP sender with timeout

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 7: Notifications Service - Send Logic (Main Entry Point)

**Files:**
- Modify: `internal/notifications/notifications.go`
- Modify: `internal/notifications/notifications_test.go`

**Step 1: Write integration test**

Add to `notifications_test.go`:

```go
func TestSend_Mention(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Create users
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 1, "alice", "Alice", "hash", "member")
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 2, "bob", "Bob", "hash", "member")

	// Create channel
	database.Exec("INSERT INTO channels (id, name, group_id, created_at) VALUES (?, ?, ?, datetime('now'))", 1, "general", "group1")

	// Add members
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 1)
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 2)

	// Setup webhook for alice
	var webhookCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webhookCalled = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	svc.UpdateSettings(1, &Settings{
		UserID:         1,
		WebhookURL:     server.URL,
		BaseURL:        "https://chat.example.com",
		NotifyMentions: true,
	})

	// Create message from bob mentioning alice
	msg := &messages.Message{
		ID:          1,
		ChannelID:   1,
		UserID:      2,
		Content:     "Hey @alice check this out",
		DisplayName: "Bob",
		Username:    "bob",
		Mentions:    []string{"alice"},
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	err := svc.Send(msg, "general")
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	// Give goroutine time to complete
	time.Sleep(100 * time.Millisecond)

	if !webhookCalled {
		t.Error("webhook was not called for mention")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/... -v`
Expected: FAIL - "undefined: Send"

**Step 3: Implement Send method**

Add to `notifications.go`:

```go
import (
	"log"
	"strings"
)

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
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/... -v`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/
git commit -m "feat: add Send notification logic with rules engine

Implements notification rules: mentions, thread replies, all messages.
Sends webhooks asynchronously in goroutines.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 8: Wire Notifications into Messages Service

**Files:**
- Modify: `internal/messages/messages.go`
- Modify: `cmd/app/main.go`

**Step 1: Add notification hook to messages.Create**

Update `messages.go` to accept a notification callback:

```go
// Add field to Service struct
type Service struct {
	db            *db.DB
	relayPriv     string
	notifyFunc    func(*Message, string) // callback for notifications
}

// SetNotifyFunc sets the callback for sending notifications.
func (s *Service) SetNotifyFunc(fn func(*Message, string)) {
	s.notifyFunc = fn
}

// Modify Create to call notification after saving
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

// Modify CreateReply similarly
func (s *Service) CreateReply(parentID, userID int64, content string, groupID string) (*Message, error) {
	// ... existing code ...

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
```

**Step 2: Wire up in main.go**

Update `cmd/app/main.go`:

```go
import (
	// ... existing imports ...
	"github.com/ebrakke/relay-chat/internal/notifications"
)

func main() {
	// ... existing setup ...

	// Services
	authSvc := auth.NewService(database)
	botSvc := bots.NewService(database)
	chanSvc := channels.NewService(database)
	msgSvc := messages.NewService(database)
	reactSvc := reactions.NewService(database)
	notifySvc := notifications.NewService(database) // ADD THIS

	// Set notification callback on message service
	msgSvc.SetNotifyFunc(func(msg *messages.Message, channelName string) {
		if err := notifySvc.Send(msg, channelName); err != nil {
			log.Printf("Notification error: %v", err)
		}
	})

	// ... rest of main ...
}
```

**Step 3: Test manually**

Run: `make dev` and verify server starts without errors
Expected: Server starts, no crashes

**Step 4: Commit**

```bash
git add internal/messages/messages.go cmd/app/main.go
git commit -m "feat: wire notifications into message creation

Messages now trigger notification checks after being created.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 9: API Handlers for Notification Settings

**Files:**
- Modify: `internal/api/api.go`

**Step 1: Add routes in api.go**

Add to `routes()` method:

```go
// Notifications
h.mux.HandleFunc("GET /api/notifications/settings", h.handleGetNotificationSettings)
h.mux.HandleFunc("POST /api/notifications/settings", h.handleUpdateNotificationSettings)
h.mux.HandleFunc("POST /api/threads/{id}/mute", h.handleMuteThread)
h.mux.HandleFunc("DELETE /api/threads/{id}/mute", h.handleUnmuteThread)
h.mux.HandleFunc("GET /api/threads/{id}/mute", h.handleGetThreadMute)
```

**Step 2: Add notification service to Handler**

Update Handler struct:

```go
type Handler struct {
	auth         *auth.Service
	bots         *bots.Service
	channels     *channels.Service
	messages     *messages.Service
	reactions    *reactions.Service
	notifications *notifications.Service // ADD THIS
	hub          *ws.Hub
	mux          *http.ServeMux
}

// Update New function signature
func New(authSvc *auth.Service, botSvc *bots.Service, chanSvc *channels.Service, msgSvc *messages.Service, reactSvc *reactions.Service, notifySvc *notifications.Service, hub *ws.Hub) *Handler {
	h := &Handler{
		auth:          authSvc,
		bots:          botSvc,
		channels:      chanSvc,
		messages:      msgSvc,
		reactions:     reactSvc,
		notifications: notifySvc, // ADD THIS
		hub:           hub,
		mux:           http.NewServeMux(),
	}
	h.routes()
	return h
}
```

**Step 3: Implement handlers**

Add handler methods:

```go
import (
	"github.com/ebrakke/relay-chat/internal/notifications"
)

func (h *Handler) handleGetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	user := requireAuth(w, r, h.auth)
	if user == nil {
		return
	}

	settings, err := h.notifications.GetSettings(user.ID)
	if err == notifications.ErrSettingsNotFound {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"configured": false,
		})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get settings")
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

func (h *Handler) handleUpdateNotificationSettings(w http.ResponseWriter, r *http.Request) {
	user := requireAuth(w, r, h.auth)
	if user == nil {
		return
	}

	var req notifications.Settings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	// Validate webhook URL
	if req.WebhookURL == "" {
		writeError(w, http.StatusBadRequest, "webhook_url is required")
		return
	}

	req.UserID = user.ID
	if err := h.notifications.UpdateSettings(user.ID, &req); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update settings")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleMuteThread(w http.ResponseWriter, r *http.Request) {
	user := requireAuth(w, r, h.auth)
	if user == nil {
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid thread ID")
		return
	}

	if err := h.notifications.MuteThread(user.ID, messageID); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to mute thread")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleUnmuteThread(w http.ResponseWriter, r *http.Request) {
	user := requireAuth(w, r, h.auth)
	if user == nil {
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid thread ID")
		return
	}

	if err := h.notifications.UnmuteThread(user.ID, messageID); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unmute thread")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleGetThreadMute(w http.ResponseWriter, r *http.Request) {
	user := requireAuth(w, r, h.auth)
	if user == nil {
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid thread ID")
		return
	}

	muted, err := h.notifications.IsThreadMuted(user.ID, messageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to check mute status")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"muted": muted})
}
```

**Step 4: Update main.go to pass notification service**

Update `cmd/app/main.go`:

```go
// API handler
apiHandler := api.New(authSvc, botSvc, chanSvc, msgSvc, reactSvc, notifySvc, hub)
```

**Step 5: Test API endpoints**

Run: `go test ./internal/api/... -v`
Expected: PASS (or add integration tests if needed)

**Step 6: Commit**

```bash
git add internal/api/api.go cmd/app/main.go
git commit -m "feat: add notification settings API endpoints

GET/POST /api/notifications/settings
POST/DELETE/GET /api/threads/{id}/mute

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 10: Frontend - Settings UI

**Files:**
- Modify: `frontend/src/app.js`

**Step 1: Add notification settings to settings modal**

Find the `renderSettings()` function and add notification section:

```js
async function renderSettings() {
  // Fetch current notification settings
  let notifSettings = null;
  try {
    const res = await api("GET", "/api/notifications/settings");
    if (res.configured !== false) {
      notifSettings = res;
    }
  } catch (e) {
    console.log("No notification settings configured");
  }

  app.innerHTML = `
    <div class="settings-container">
      <h2>Settings</h2>

      <!-- Existing settings sections ... -->

      <div class="settings-section">
        <h3>Notifications</h3>
        <div class="form-group">
          <label>Webhook URL</label>
          <input type="text" id="webhook-url" value="${notifSettings?.webhookUrl || ''}" placeholder="https://api.pushover.net/1/messages.json?token=...">
          <small>Examples: Pushover, ntfy.sh, or any custom webhook endpoint</small>
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input type="text" id="base-url" value="${notifSettings?.baseUrl || window.location.origin}" placeholder="https://chat.example.com">
          <small>Used for deep links in notifications</small>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="notify-mentions" ${notifSettings?.notifyMentions !== false ? 'checked' : ''}>
            Notify on @mentions
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="notify-thread-replies" ${notifSettings?.notifyThreadReplies !== false ? 'checked' : ''}>
            Notify on thread replies
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="notify-all-messages" ${notifSettings?.notifyAllMessages === true ? 'checked' : ''}>
            Notify on all messages
          </label>
        </div>
        <button id="save-notifications">Save Notification Settings</button>
      </div>
    </div>
  `;

  // Add save handler
  document.getElementById("save-notifications")?.addEventListener("click", async () => {
    const webhookUrl = document.getElementById("webhook-url").value.trim();
    const baseUrl = document.getElementById("base-url").value.trim();

    if (!webhookUrl) {
      alert("Webhook URL is required");
      return;
    }

    try {
      await api("POST", "/api/notifications/settings", {
        webhookUrl,
        baseUrl: baseUrl || window.location.origin,
        notifyMentions: document.getElementById("notify-mentions").checked,
        notifyThreadReplies: document.getElementById("notify-thread-replies").checked,
        notifyAllMessages: document.getElementById("notify-all-messages").checked,
      });
      alert("Notification settings saved");
    } catch (e) {
      alert("Failed to save: " + e.message);
    }
  });
}
```

**Step 2: Add CSS for notification settings**

Add to `frontend/src/style.css`:

```css
.settings-section {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #ddd;
}

.settings-section h3 {
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #666;
  font-size: 0.875rem;
}

.form-group input[type="checkbox"] {
  margin-right: 0.5rem;
}

button {
  padding: 0.5rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}
```

**Step 3: Build frontend**

Run: `cd frontend && bun run build && cd ..`
Expected: Build succeeds

**Step 4: Copy to static**

Run: `cp frontend/dist/* cmd/app/static/`

**Step 5: Commit**

```bash
git add frontend/ cmd/app/static/
git commit -m "feat: add notification settings UI

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 11: Frontend - Thread Mute/Unmute UI

**Files:**
- Modify: `frontend/src/app.js`

**Step 1: Add mute button to thread header**

Find the thread rendering code and add mute button:

```js
async function renderThread(parentId) {
  // ... existing thread fetch code ...

  // Check if thread is muted
  let isMuted = false;
  try {
    const muteStatus = await api("GET", `/api/threads/${parentId}/mute`);
    isMuted = muteStatus.muted;
  } catch (e) {
    console.error("Failed to check mute status", e);
  }

  const threadHTML = `
    <div class="thread-header">
      <h3>Thread</h3>
      <button id="mute-thread" class="icon-button" title="${isMuted ? 'Unmute' : 'Mute'} thread">
        ${isMuted ? '🔔' : '🔕'}
      </button>
      <button id="close-thread" class="icon-button">✕</button>
    </div>
    <!-- ... rest of thread content ... -->
  `;

  // Add mute/unmute handler
  document.getElementById("mute-thread")?.addEventListener("click", async () => {
    try {
      if (isMuted) {
        await api("DELETE", `/api/threads/${parentId}/mute`);
        isMuted = false;
      } else {
        await api("POST", `/api/threads/${parentId}/mute`);
        isMuted = true;
      }
      renderThread(parentId); // Re-render to update icon
    } catch (e) {
      console.error("Failed to toggle mute", e);
    }
  });
}
```

**Step 2: Add CSS for mute button**

Add to `frontend/src/style.css`:

```css
.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.icon-button {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.icon-button:hover {
  background-color: #f0f0f0;
  border-radius: 4px;
}
```

**Step 3: Build and copy**

Run: `cd frontend && bun run build && cd .. && cp frontend/dist/* cmd/app/static/`

**Step 4: Commit**

```bash
git add frontend/ cmd/app/static/
git commit -m "feat: add thread mute/unmute button

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 12: Frontend - Deep Link Routing

**Files:**
- Modify: `frontend/src/app.js`

**Step 1: Add URL hash parsing on load**

Add URL hash handler at initialization:

```js
// Handle deep links from notifications
function handleDeepLink() {
  const hash = window.location.hash;
  if (!hash) return;

  // Parse: #/channel/123/thread/456 or #/channel/123
  const match = hash.match(/#\/channel\/(\d+)(?:\/thread\/(\d+))?/);
  if (!match) return;

  const channelId = parseInt(match[1], 10);
  const threadId = match[2] ? parseInt(match[2], 10) : null;

  // Switch to that channel
  currentChannel = channelId;
  loadMessages(channelId);

  // Open thread if specified
  if (threadId) {
    setTimeout(() => openThread(threadId), 500);
  }
}

// Call on load
window.addEventListener("load", () => {
  init();
  handleDeepLink();
});

// Also handle hash changes
window.addEventListener("hashchange", handleDeepLink);
```

**Step 2: Build and copy**

Run: `cd frontend && bun run build && cd .. && cp frontend/dist/* cmd/app/static/`

**Step 3: Test manually**

Run: `make dev` and open `http://localhost:8080/#/channel/1/thread/5`
Expected: App opens to channel 1 with thread 5 open

**Step 4: Commit**

```bash
git add frontend/ cmd/app/static/
git commit -m "feat: add deep link routing for notifications

Handles URLs like #/channel/123/thread/456 from webhook notifications.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 13: Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add notifications section to README**

Add after the "Features" section:

```markdown
### Notifications

Get mobile notifications via webhooks when:
- Someone @mentions you
- Someone replies to a thread you're in
- All messages (optional)

**Setup:**

1. Sign up for a notification service:
   - **Pushover**: https://pushover.net (paid, $5 one-time)
   - **ntfy.sh**: https://ntfy.sh (free, self-hostable)
   - Or use any custom webhook endpoint

2. In Relay Chat settings, configure:
   - **Webhook URL**: Your service's webhook endpoint
   - **Base URL**: Your Relay Chat URL (e.g., `https://chat.example.com`)
   - **Preferences**: Choose what triggers notifications

3. Tap notifications on mobile to open directly to that message/thread

**Webhook URL Examples:**

Pushover:
```
https://api.pushover.net/1/messages.json?token=YOUR_APP_TOKEN&user=YOUR_USER_KEY
```

ntfy.sh:
```
https://ntfy.sh/YOUR_TOPIC
```

**Thread Muting:**

Mute busy threads to stop getting notifications. Click the 🔕 icon in the thread header.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add notification setup guide

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 14: Integration Testing

**Files:**
- Create: `internal/notifications/integration_test.go`

**Step 1: Write end-to-end integration test**

```go
package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
)

func TestIntegration_NotificationFlow(t *testing.T) {
	// Setup database
	database, _ := db.Open(":memory:")
	defer database.Close()

	// Create services
	notifySvc := NewService(database)
	msgSvc := messages.NewService(database)

	// Setup webhook mock
	var receivedNotifications []map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		json.NewDecoder(r.Body).Decode(&payload)
		receivedNotifications = append(receivedNotifications, payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create users
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 1, "alice", "Alice", "hash", "member")
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 2, "bob", "Bob", "hash", "member")

	// Create channel
	database.Exec("INSERT INTO channels (id, name, group_id, created_at) VALUES (?, ?, ?, datetime('now'))", 1, "general", "group1")
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 1)
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 2)

	// Configure Alice's notifications
	notifySvc.UpdateSettings(1, &Settings{
		UserID:              1,
		WebhookURL:          server.URL,
		BaseURL:             "https://chat.example.com",
		NotifyMentions:      true,
		NotifyThreadReplies: true,
	})

	// Wire up message service with notification callback
	msgSvc.SetNotifyFunc(func(msg *messages.Message, channelName string) {
		notifySvc.Send(msg, channelName)
	})

	// Bob sends a message mentioning Alice
	msg, err := msgSvc.Create(1, 2, "Hey @alice, check this out!", "group1")
	if err != nil {
		t.Fatalf("Create message failed: %v", err)
	}

	// Wait for webhook
	time.Sleep(200 * time.Millisecond)

	// Verify webhook was called
	if len(receivedNotifications) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(receivedNotifications))
	}

	notification := receivedNotifications[0]
	if notification["notificationType"] != "mention" {
		t.Errorf("notificationType = %v, want mention", notification["notificationType"])
	}
	if notification["sender"] != "Bob" {
		t.Errorf("sender = %v, want Bob", notification["sender"])
	}

	// Alice replies to the message (creates a thread)
	reply, err := msgSvc.CreateReply(msg.ID, 1, "Thanks Bob!", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	// Bob should NOT get notified (he's the thread author but Alice is replying)
	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 1 {
		t.Errorf("Bob should not be notified of Alice's reply to his own thread, got %d notifications", len(receivedNotifications))
	}

	// Bob replies to the thread - Alice should get notified
	_, err = msgSvc.CreateReply(msg.ID, 2, "No problem!", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(receivedNotifications))
	}

	notification = receivedNotifications[1]
	if notification["notificationType"] != "thread_reply" {
		t.Errorf("notificationType = %v, want thread_reply", notification["notificationType"])
	}

	// Alice mutes the thread
	notifySvc.MuteThread(1, msg.ID)

	// Bob replies again - Alice should NOT get notified
	_, err = msgSvc.CreateReply(msg.ID, 2, "Another reply", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 2 {
		t.Errorf("Alice should not be notified after muting, got %d notifications", len(receivedNotifications))
	}
}
```

**Step 2: Run integration test**

Run: `go test ./internal/notifications/... -v -run TestIntegration`
Expected: PASS

**Step 3: Commit**

```bash
git add internal/notifications/integration_test.go
git commit -m "test: add end-to-end notification integration test

Tests mention notifications, thread replies, and muting.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 15: Manual Testing Guide

**Files:**
- Create: `docs/testing/notification-testing.md`

**Step 1: Write manual testing guide**

```markdown
# Notification Testing Guide

## Prerequisites

1. Sign up for a test notification service:
   - **ntfy.sh** (easiest, free): https://ntfy.sh
   - Create a topic (e.g., `relay-chat-test-12345`)

## Test Scenarios

### Scenario 1: Mention Notification

1. Create two users (Alice and Bob)
2. Configure Alice's notification settings:
   - Webhook URL: `https://ntfy.sh/relay-chat-test-12345`
   - Base URL: `http://localhost:8080`
   - Enable "Notify on @mentions"
3. Log in as Bob
4. Send message in #general: `Hey @alice check this out`
5. **Expected:** Alice receives notification on ntfy.sh app
6. **Expected:** Tapping notification opens browser to `http://localhost:8080/#/channel/1`

### Scenario 2: Thread Reply Notification

1. Log in as Bob
2. Send a message in #general (creates a thread)
3. Log in as Alice
4. Reply to Bob's message
5. Log in as Bob
6. Reply again to the thread
7. **Expected:** Alice receives "New reply in #general" notification
8. **Expected:** Tapping opens to the thread

### Scenario 3: Thread Muting

1. Continue from Scenario 2
2. As Alice, click the thread's mute button (🔕)
3. Log in as Bob
4. Reply again to the thread
5. **Expected:** Alice does NOT receive notification
6. As Alice, unmute the thread (🔔)
7. As Bob, reply again
8. **Expected:** Alice receives notification

### Scenario 4: Invalid Webhook

1. Configure webhook URL to `https://invalid-url-does-not-exist.example.com/webhook`
2. Send a message that would trigger notification
3. **Expected:** Message still sends successfully (webhook failure doesn't block)
4. **Expected:** Error logged in server console

## Cleanup

1. Delete test webhook settings
2. Delete test users if needed
```

**Step 2: Commit**

```bash
git add docs/testing/notification-testing.md
git commit -m "docs: add manual notification testing guide

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Summary

This plan implements webhook-based mobile notifications with:

- **Backend:** Notification service with rules engine, webhook sender
- **Database:** Settings and thread mutes tables
- **API:** Endpoints for managing settings and mutes
- **Frontend:** Settings UI, mute buttons, deep link routing
- **Testing:** Unit tests, integration tests, manual testing guide
- **Docs:** README updates with setup instructions

**Next Steps:**
- Run all tests: `go test ./...`
- Build and run: `make dev`
- Test with real notification service (Pushover or ntfy.sh)
