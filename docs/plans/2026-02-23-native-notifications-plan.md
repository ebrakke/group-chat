# Native Push Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Pushover notifications with native push via ntfy.sh (Android FCM) and Browser Notification API (web).

**Architecture:** Server sends HTTP POSTs to ntfy.sh per-user topics. ntfy.sh handles FCM delivery to Android devices. Web users get Browser Notifications triggered locally from the existing WebSocket connection. Pushover is removed entirely.

**Tech Stack:** Go backend (net/http), Capacitor 6 + @capacitor/push-notifications (Android), vanilla JS frontend, SQLite, ntfy.sh HTTP API.

---

## Pre-requisites

**Note:** The existing notification tests (`internal/notifications/notifications_test.go` and `integration_test.go`) are already broken — they reference old `WebhookURL`/`BaseURL` fields that were renamed to `Provider`/`ProviderConfig` in migration 008. These will be fixed as part of this plan.

---

### Task 1: Database Migration — push_subscriptions table + ntfy settings

**Files:**
- Create: `internal/db/migrations/012_native_push_notifications.sql`

**Step 1: Write the migration**

```sql
-- Push notification subscriptions (ntfy.sh topics per user)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ntfy_topic TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Seed ntfy server URL setting (replaces pushover_app_token)
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('ntfy_server_url', '', datetime('now'));
```

Create this file at `internal/db/migrations/012_native_push_notifications.sql`.

**Step 2: Verify migration applies**

Run: `go test ./internal/db/ -count=1 -v -run TestOpen`

Expected: PASS (the db.Open function runs all migrations on `:memory:` databases).

**Step 3: Commit**

```bash
git add internal/db/migrations/012_native_push_notifications.sql
git commit -m "feat: add push_subscriptions migration for ntfy.sh"
```

---

### Task 2: NtfyProvider — implement the ntfy.sh notification provider

**Files:**
- Create: `internal/notifications/ntfy.go`
- Create: `internal/notifications/ntfy_test.go`

**Step 1: Write the failing test**

Create `internal/notifications/ntfy_test.go`:

```go
package notifications

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNtfyProvider_Send(t *testing.T) {
	var receivedMethod string
	var receivedBody string
	var receivedHeaders http.Header

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		receivedHeaders = r.Header
		body, _ := io.ReadAll(r.Body)
		receivedBody = string(body)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	provider := NewNtfyProvider(ts.URL)

	recipient := Recipient{
		UserID:      1,
		ProviderKey: "test-topic-abc123",
	}
	payload := Payload{
		Title:   "New message in #general",
		Message: "Hello world",
		URL:     "https://chat.example.com/#/channel/1",
	}

	err := provider.Send(context.Background(), recipient, payload)
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if receivedMethod != "POST" {
		t.Errorf("method = %s, want POST", receivedMethod)
	}
	if receivedBody != "Hello world" {
		t.Errorf("body = %q, want %q", receivedBody, "Hello world")
	}
	if receivedHeaders.Get("Title") != "New message in #general" {
		t.Errorf("Title header = %q, want %q", receivedHeaders.Get("Title"), "New message in #general")
	}
	if receivedHeaders.Get("Click") != "https://chat.example.com/#/channel/1" {
		t.Errorf("Click header = %q, want %q", receivedHeaders.Get("Click"), "https://chat.example.com/#/channel/1")
	}
}

func TestNtfyProvider_Send_MissingTopic(t *testing.T) {
	provider := NewNtfyProvider("https://ntfy.example.com")
	err := provider.Send(context.Background(), Recipient{UserID: 1, ProviderKey: ""}, Payload{})
	if err == nil {
		t.Error("expected error for empty topic")
	}
}

func TestNtfyProvider_Send_MissingServerURL(t *testing.T) {
	provider := NewNtfyProvider("")
	err := provider.Send(context.Background(), Recipient{UserID: 1, ProviderKey: "topic"}, Payload{})
	if err == nil {
		t.Error("expected error for empty server URL")
	}
}

func TestNtfyProvider_ValidateConfig(t *testing.T) {
	tests := []struct {
		name        string
		serverURL   string
		expectError bool
	}{
		{"valid URL", "https://ntfy.example.com", false},
		{"empty URL", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := NewNtfyProvider(tt.serverURL)
			err := provider.ValidateConfig()
			if (err != nil) != tt.expectError {
				t.Errorf("expected error: %v, got: %v", tt.expectError, err)
			}
		})
	}
}

func TestNtfyProvider_Send_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	provider := NewNtfyProvider(ts.URL)
	err := provider.Send(context.Background(), Recipient{UserID: 1, ProviderKey: "topic"}, Payload{Message: "test"})
	if err == nil {
		t.Error("expected error for 500 response")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/ -run TestNtfy -v`

Expected: FAIL — `NewNtfyProvider` undefined.

**Step 3: Write the implementation**

Create `internal/notifications/ntfy.go`:

```go
// internal/notifications/ntfy.go
package notifications

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// NtfyProvider sends notifications via ntfy.sh HTTP API
type NtfyProvider struct {
	serverURL  string
	httpClient *http.Client
}

// NewNtfyProvider creates a new ntfy.sh provider
func NewNtfyProvider(serverURL string) *NtfyProvider {
	return &NtfyProvider{
		serverURL:  strings.TrimRight(serverURL, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send delivers notification via ntfy.sh HTTP publishing API.
// The recipient's ProviderKey is used as the ntfy topic.
func (n *NtfyProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
	if n.serverURL == "" {
		return fmt.Errorf("ntfy server URL not configured")
	}
	topic := recipient.ProviderKey
	if topic == "" {
		return fmt.Errorf("ntfy topic not configured for user")
	}

	url := n.serverURL + "/" + topic

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(payload.Message))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	// ntfy.sh uses headers for metadata
	req.Header.Set("Title", payload.Title)
	if payload.URL != "" {
		req.Header.Set("Click", payload.URL)
	}
	req.Header.Set("Priority", "default")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("ntfy returned status %d", resp.StatusCode)
	}

	return nil
}

// ValidateConfig checks if provider is properly configured
func (n *NtfyProvider) ValidateConfig() error {
	if n.serverURL == "" {
		return fmt.Errorf("ntfy server URL required")
	}
	return nil
}
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/ -run TestNtfy -v`

Expected: PASS (all `TestNtfy*` tests pass).

**Step 5: Commit**

```bash
git add internal/notifications/ntfy.go internal/notifications/ntfy_test.go
git commit -m "feat: add NtfyProvider for ntfy.sh push notifications"
```

---

### Task 3: Push subscription CRUD methods on Service

**Files:**
- Modify: `internal/notifications/notifications.go` — add push subscription methods
- Modify: `internal/notifications/provider.go` — update Recipient comment

**Step 1: Write the failing test**

Add to `internal/notifications/service_test.go` (append, don't replace existing tests):

```go
func TestService_PushSubscriptions(t *testing.T) {
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	svc := NewService(database, "http://localhost:8080")

	// Create test user
	_, err = database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 1, "alice", "Alice", "hash", "member")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// No subscriptions initially
	topics, err := svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 0 {
		t.Errorf("expected 0 topics, got %d", len(topics))
	}

	// Subscribe
	err = svc.SubscribePush(1, "topic-abc123", "android")
	if err != nil {
		t.Fatalf("SubscribePush failed: %v", err)
	}

	// Verify subscription
	topics, err = svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 1 || topics[0] != "topic-abc123" {
		t.Errorf("expected ['topic-abc123'], got %v", topics)
	}

	// Unsubscribe
	err = svc.UnsubscribePush("topic-abc123")
	if err != nil {
		t.Fatalf("UnsubscribePush failed: %v", err)
	}

	// Verify removed
	topics, err = svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 0 {
		t.Errorf("expected 0 topics after unsubscribe, got %d", len(topics))
	}
}
```

Note: You'll need to add the `db` import to `service_test.go`:

```go
import (
	"context"
	"fmt"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/notifications/ -run TestService_PushSubscriptions -v`

Expected: FAIL — `svc.GetPushTopics` undefined.

**Step 3: Write the implementation**

Add these methods to `internal/notifications/notifications.go`:

```go
// SubscribePush registers a push subscription for a user.
func (s *Service) SubscribePush(userID int64, ntfyTopic, platform string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO push_subscriptions (user_id, ntfy_topic, platform, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, userID, ntfyTopic, platform, now, now)
	if err != nil {
		return fmt.Errorf("subscribe push: %w", err)
	}
	return nil
}

// UnsubscribePush removes a push subscription by topic.
func (s *Service) UnsubscribePush(ntfyTopic string) error {
	_, err := s.db.Exec(`DELETE FROM push_subscriptions WHERE ntfy_topic = ?`, ntfyTopic)
	if err != nil {
		return fmt.Errorf("unsubscribe push: %w", err)
	}
	return nil
}

// GetPushTopics returns all ntfy topics for a user.
func (s *Service) GetPushTopics(userID int64) ([]string, error) {
	rows, err := s.db.Query(`SELECT ntfy_topic FROM push_subscriptions WHERE user_id = ?`, userID)
	if err != nil {
		return nil, fmt.Errorf("get push topics: %w", err)
	}
	defer rows.Close()

	var topics []string
	for rows.Next() {
		var topic string
		if err := rows.Scan(&topic); err != nil {
			return nil, err
		}
		topics = append(topics, topic)
	}
	return topics, rows.Err()
}
```

Also update the `Recipient.ProviderKey` comment in `provider.go`:

```go
ProviderKey string // ntfy topic, webhook URL, etc.
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/notifications/ -run TestService_PushSubscriptions -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add internal/notifications/notifications.go internal/notifications/service_test.go internal/notifications/provider.go
git commit -m "feat: add push subscription CRUD methods"
```

---

### Task 4: Update Send() to use ntfy for users with push subscriptions

**Files:**
- Modify: `internal/notifications/notifications.go` — update `sendToUser`, add `ReloadNtfyProvider`, remove `ReloadPushoverProvider`

**Step 1: Update sendToUser to check push subscriptions**

Replace the `sendToUser` method in `internal/notifications/notifications.go`. The new logic:

1. Check notification rules (same as before).
2. Look up push subscriptions for the user.
3. If user has push topics, send via ntfy provider to each topic.
4. Otherwise, fall back to the provider from their settings (webhook).

Replace `sendToUser` with:

```go
// sendToUser sends a notification to a specific user.
func (s *Service) sendToUser(userID int64, msg *messages.Message, channelName string) {
	// Get user's notification settings
	settings, err := s.GetSettings(userID)
	if err != nil || settings == nil {
		// Even without settings, check for push subscriptions with default rules
		// (default: notify on mentions and thread replies)
		settings = &Settings{
			UserID:              userID,
			NotifyMentions:      true,
			NotifyThreadReplies: true,
		}
	}

	// Check notification rules
	if !s.shouldNotify(userID, msg, settings) {
		return
	}

	// Build payload
	payload := s.buildPayload(msg, channelName)

	// Try push subscriptions first (ntfy)
	topics, _ := s.GetPushTopics(userID)
	if len(topics) > 0 {
		if ntfyProvider, ok := s.providers["ntfy"]; ok {
			for _, topic := range topics {
				recipient := Recipient{UserID: userID, ProviderKey: topic}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				if err := ntfyProvider.Send(ctx, recipient, payload); err != nil {
					log.Printf("Ntfy send error (user %d, topic %s): %v", userID, topic, err)
				}
				cancel()
			}
		}
		return
	}

	// Fall back to configured provider (webhook, etc.)
	if settings.Provider == "" {
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
```

**Step 2: Replace ReloadPushoverProvider with ReloadNtfyProvider**

Replace the `ReloadPushoverProvider` method:

```go
// ReloadNtfyProvider reloads the ntfy provider with current config from database
func (s *Service) ReloadNtfyProvider() error {
	serverURL, err := s.GetAppSetting("ntfy_server_url")
	if err != nil {
		s.UnregisterProvider("ntfy")
		return nil
	}

	if serverURL == "" {
		s.UnregisterProvider("ntfy")
		return nil
	}

	s.RegisterProvider("ntfy", NewNtfyProvider(serverURL))
	log.Printf("Ntfy provider reloaded with URL: %s", serverURL)
	return nil
}
```

**Step 3: Run all notification tests**

Run: `go test ./internal/notifications/ -run "TestNtfy|TestService_" -v`

Expected: PASS.

**Step 4: Commit**

```bash
git add internal/notifications/notifications.go
git commit -m "feat: update Send() to route via ntfy for push subscribers"
```

---

### Task 5: Remove Pushover provider

**Files:**
- Delete: `internal/notifications/pushover.go`
- Delete: `internal/notifications/pushover_test.go`
- Modify: `cmd/app/main.go` — remove Pushover registration, add ntfy registration

**Step 1: Delete Pushover files**

```bash
rm internal/notifications/pushover.go internal/notifications/pushover_test.go
```

**Step 2: Update main.go**

In `cmd/app/main.go`, replace the Pushover registration block (lines ~78-86):

Replace:
```go
	// Register webhook provider (always available)
	notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

	// Register Pushover provider if configured
	pushoverToken, err := notifySvc.GetAppSetting("pushover_app_token")
	if err == nil && pushoverToken != "" {
		notifySvc.RegisterProvider("pushover", notifications.NewPushoverProvider(pushoverToken))
		log.Printf("Pushover provider enabled")
	}
```

With:
```go
	// Register webhook provider (always available)
	notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

	// Register ntfy provider if configured
	ntfyURL, err := notifySvc.GetAppSetting("ntfy_server_url")
	if err == nil && ntfyURL != "" {
		notifySvc.RegisterProvider("ntfy", notifications.NewNtfyProvider(ntfyURL))
		log.Printf("Ntfy provider enabled: %s", ntfyURL)
	}
```

**Step 3: Verify build**

Run: `go build ./cmd/app/`

Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove Pushover provider, register ntfy provider in main"
```

---

### Task 6: API endpoints — push subscribe/unsubscribe + update admin settings

**Files:**
- Modify: `internal/api/api.go` — add push endpoints, update admin settings handler

**Step 1: Add push subscribe/unsubscribe routes**

In the `routes()` method of `internal/api/api.go`, after the existing notification routes (around line 108), add:

```go
	// Push subscriptions
	h.mux.HandleFunc("POST /api/push/subscribe", h.handlePushSubscribe)
	h.mux.HandleFunc("DELETE /api/push/subscribe", h.handlePushUnsubscribe)
```

**Step 2: Add handler implementations**

Add these handlers to `internal/api/api.go` (in the notification handlers section, around line 1200):

```go
func (h *Handler) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		NtfyTopic string `json:"ntfyTopic"`
		Platform  string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid request"))
		return
	}

	if req.NtfyTopic == "" {
		writeErr(w, http.StatusBadRequest, errors.New("ntfyTopic is required"))
		return
	}
	if req.Platform == "" {
		req.Platform = "android"
	}

	if err := h.notifications.SubscribePush(user.ID, req.NtfyTopic, req.Platform); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to subscribe"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		NtfyTopic string `json:"ntfyTopic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid request"))
		return
	}

	if req.NtfyTopic == "" {
		writeErr(w, http.StatusBadRequest, errors.New("ntfyTopic is required"))
		return
	}

	if err := h.notifications.UnsubscribePush(req.NtfyTopic); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to unsubscribe"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
```

**Step 3: Update admin settings handler**

In `handleGetAdminSettings`, replace the `pushover_app_token` case:

Replace:
```go
		case "pushover_app_token":
			response["pushoverAppToken"] = v
```

With:
```go
		case "ntfy_server_url":
			response["ntfyServerUrl"] = v
```

In `handleUpdateAdminSettings`, replace the Pushover reload block:

Replace:
```go
	// Reload Pushover provider if token was updated
	if _, hasPushoverToken := req["pushover_app_token"]; hasPushoverToken {
		if err := h.notifications.ReloadPushoverProvider(); err != nil {
			log.Printf("Warning: failed to reload Pushover provider: %v", err)
		}
	}
```

With:
```go
	// Reload ntfy provider if URL was updated
	if _, hasNtfyURL := req["ntfy_server_url"]; hasNtfyURL {
		if err := h.notifications.ReloadNtfyProvider(); err != nil {
			log.Printf("Warning: failed to reload ntfy provider: %v", err)
		}
	}
```

**Step 4: Update notification settings handler**

In `handleUpdateNotificationSettings`, remove the provider validation (lines 1122-1126):

Remove:
```go
	// Validate provider
	if req.Provider == "" {
		writeErr(w, http.StatusBadRequest, errors.New("provider is required"))
		return
	}
```

**Step 5: Verify build**

Run: `go build ./cmd/app/`

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add push subscribe/unsubscribe API, update admin settings for ntfy"
```

---

### Task 7: Frontend — Browser Notification API from WebSocket

**Files:**
- Modify: `frontend/src/app.js` — add browser notification support

**Step 1: Add notification permission request**

Near the top of `frontend/src/app.js`, after the service worker registration block (around line 47), add:

```javascript
// Request browser notification permission (web only)
if ('Notification' in window && !Capacitor.isNativePlatform()) {
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
```

**Step 2: Add browser notification firing in handleWSEvent**

In the `handleWSEvent` function, inside the `data.type === "new_message"` block, after the unread state update (around line 136, after `updateChannelBadge(msg.channelId)`), add browser notification logic:

```javascript
      // Fire browser notification for messages not in the current view (web only)
      if (!Capacitor.isNativePlatform() && Notification.permission === 'granted') {
        // Only notify if tab is not focused or message is in a different channel
        if (document.hidden || !currentChannel || msg.channelId !== currentChannel.id) {
          const channelName = document.querySelector(`#channel-list li[data-id="${msg.channelId}"]`)?.dataset?.name || 'unknown';
          new Notification(`#${channelName}`, {
            body: `${msg.displayName}: ${msg.content.substring(0, 100)}`,
            tag: `relaychat-${msg.channelId}-${msg.id}`,
          });
        }
      }
```

Add the same logic inside the `data.type === "new_reply"` handler, after the `updateReplyCount` call:

```javascript
    // Fire browser notification for thread replies (web only)
    if (!Capacitor.isNativePlatform() && Notification.permission === 'granted') {
      if (document.hidden || !openThreadId || msg.parentId !== openThreadId) {
        new Notification('Thread reply', {
          body: `${msg.displayName}: ${msg.content.substring(0, 100)}`,
          tag: `relaychat-thread-${msg.parentId}-${msg.id}`,
        });
      }
    }
```

**Step 3: Build frontend**

Run: `cd frontend && bun run build`

Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: add Browser Notification API for web users"
```

---

### Task 8: Frontend — replace Pushover UI with ntfy admin settings

**Files:**
- Modify: `frontend/src/app.js` — settings page

**Step 1: Replace Pushover admin section with ntfy settings**

In the `renderSettings()` function, replace the `adminPushoverSection` template (the block that includes "Pushover Integration" card, around lines 1037-1063):

Replace the entire `const adminPushoverSection = isAdmin ? \`...\` : '';` block with:

```javascript
  const adminNtfySection = isAdmin ? `
    <div class="card">
      <h3>General Settings</h3>
      <div id="general-settings-error" class="error hidden"></div>
      <div id="general-settings-success" class="success hidden"></div>
      <div id="general-settings-content">
        <div class="form-group">
          <label>Base URL</label>
          <input type="text" id="base-url" placeholder="https://chat.example.com" class="input-sm">
          <small>Used in notification links. Include protocol (http:// or https://)</small>
        </div>
        <button id="save-general-settings" class="btn-sm">Save General Settings</button>
      </div>
    </div>
    <div class="card">
      <h3>Push Notifications (ntfy.sh)</h3>
      <div id="ntfy-settings-error" class="error hidden"></div>
      <div id="ntfy-settings-success" class="success hidden"></div>
      <div id="ntfy-settings-content">
        <div class="form-group">
          <label>ntfy Server URL</label>
          <input type="text" id="ntfy-server-url" placeholder="https://ntfy.example.com" class="input-sm">
          <small>Your self-hosted ntfy server URL or https://ntfy.sh for the public instance</small>
        </div>
        <button id="save-ntfy-settings" class="btn-sm">Save ntfy Settings</button>
      </div>
    </div>
  ` : '';
```

Update the settings page HTML to use `${adminNtfySection}` instead of `${adminPushoverSection}`.

**Step 2: Replace Pushover user key with simplified notification settings**

In the notification settings card (around lines 1076-1105), remove the Pushover User Key form group. The card should just have the checkboxes:

```javascript
      <div class="card">
        <h3>Notifications</h3>
        <div id="notification-error" class="error hidden"></div>
        <div id="notification-success" class="success hidden"></div>
        <div id="notification-settings-content">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-mentions" checked>
              Notify on @mentions
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-thread-replies" checked>
              Notify on thread replies
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="notify-all-messages">
              Notify on all messages
            </label>
          </div>
          <button id="save-notifications" class="btn-sm">Save Notification Settings</button>
        </div>
      </div>
```

**Step 3: Update admin event handlers**

In the admin event handler section (around lines 1176-1184), replace the Pushover settings handlers:

Replace:
```javascript
    const savePushoverSettingsBtn = document.getElementById("save-pushover-settings");
    if (savePushoverSettingsBtn) {
      savePushoverSettingsBtn.onclick = savePushoverSettings;
    }
    ...
    await loadPushoverSettings();
```

With:
```javascript
    const saveNtfySettingsBtn = document.getElementById("save-ntfy-settings");
    if (saveNtfySettingsBtn) {
      saveNtfySettingsBtn.onclick = saveNtfySettings;
    }
    ...
    await loadNtfySettings();
```

**Step 4: Replace Pushover settings functions with ntfy functions**

Replace `loadPushoverSettings` and `savePushoverSettings` functions:

```javascript
async function loadNtfySettings() {
  try {
    const res = await api("GET", "/api/admin/settings");
    const ntfyUrlInput = document.getElementById("ntfy-server-url");
    if (!ntfyUrlInput) return;

    if (res.ntfyServerUrl) {
      ntfyUrlInput.value = res.ntfyServerUrl;
    }
  } catch (e) {
    console.log("No ntfy settings configured yet");
  }
}

async function saveNtfySettings() {
  const errEl = document.getElementById("ntfy-settings-error");
  const successEl = document.getElementById("ntfy-settings-success");

  errEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const serverUrl = document.getElementById("ntfy-server-url").value.trim();
  if (!serverUrl) {
    errEl.textContent = "ntfy Server URL is required";
    errEl.classList.remove("hidden");
    return;
  }

  try {
    await api("POST", "/api/admin/settings", {
      ntfy_server_url: serverUrl,
    });
    successEl.textContent = "ntfy settings saved. Provider reloaded.";
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 5000);
  } catch (e) {
    errEl.textContent = "Failed to save settings: " + e.message;
    errEl.classList.remove("hidden");
  }
}
```

**Step 5: Update loadNotificationSettings and saveNotificationSettings**

Replace `loadNotificationSettings`:

```javascript
async function loadNotificationSettings() {
  try {
    const res = await api("GET", "/api/notifications/settings");
    const notifyMentions = document.getElementById("notify-mentions");
    const notifyThreadReplies = document.getElementById("notify-thread-replies");
    const notifyAllMessages = document.getElementById("notify-all-messages");

    if (res.configured !== false && res.userId) {
      notifyMentions.checked = res.notifyMentions !== false;
      notifyThreadReplies.checked = res.notifyThreadReplies !== false;
      notifyAllMessages.checked = res.notifyAllMessages === true;
    }
  } catch (e) {
    console.error("Error loading notification settings:", e);
  }
}
```

Replace `saveNotificationSettings`:

```javascript
async function saveNotificationSettings() {
  const errEl = document.getElementById("notification-error");
  const successEl = document.getElementById("notification-success");

  errEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const notifyMentions = document.getElementById("notify-mentions").checked;
  const notifyThreadReplies = document.getElementById("notify-thread-replies").checked;
  const notifyAllMessages = document.getElementById("notify-all-messages").checked;

  try {
    await api("POST", "/api/notifications/settings", {
      notifyMentions,
      notifyThreadReplies,
      notifyAllMessages,
    });
    successEl.textContent = "Notification settings saved successfully";
    successEl.classList.remove("hidden");
    setTimeout(() => successEl.classList.add("hidden"), 3000);
  } catch (e) {
    errEl.textContent = "Failed to save settings: " + e.message;
    errEl.classList.remove("hidden");
  }
}
```

**Step 6: Build frontend and copy static files**

Run: `make frontend`

Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/app.js cmd/app/static/
git commit -m "feat: replace Pushover UI with ntfy admin settings, simplify user notification prefs"
```

---

### Task 9: Mobile app — Capacitor push notifications + ntfy subscription

**Files:**
- Modify: `mobile/package.json` — add push notifications dependency
- Modify: `mobile/capacitor.config.ts` — add push notification config
- Modify: `frontend/src/app.js` — add native push registration logic

**Step 1: Install Capacitor push notifications plugin**

Run:
```bash
cd mobile && npm install @capacitor/push-notifications
```

**Step 2: Add push notification registration to frontend**

In `frontend/src/app.js`, add the push notification import at the top (after the existing Capacitor imports):

```javascript
import { PushNotifications } from '@capacitor/push-notifications';
```

Note: This import will only resolve in the Capacitor native context. For web, it'll be a no-op since we gate all usage behind `Capacitor.isNativePlatform()`.

After a successful login (in the login success handler — look for where `currentUser` is set and `connectWS()` is called), add native push registration:

```javascript
// Register for native push notifications (mobile only)
if (Capacitor.isNativePlatform()) {
  registerNativePush();
}
```

Add the `registerNativePush` function:

```javascript
async function registerNativePush() {
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt') {
      await PushNotifications.requestPermissions();
    }

    await PushNotifications.register();

    // Generate a unique ntfy topic for this device
    const ntfyTopic = 'relaychat-' + currentUser.id + '-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('ntfyTopic', ntfyTopic);

    // Register the topic with the server
    await api("POST", "/api/push/subscribe", {
      ntfyTopic: ntfyTopic,
      platform: "android",
    });

    // Listen for notifications received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received:', notification);
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push action:', action);
      const data = action.notification.data;
      if (data && data.click) {
        // Navigate to the deep link
        const url = new URL(data.click);
        const hash = url.hash || '';
        if (hash) {
          window.location.hash = hash;
        }
      }
    });
  } catch (e) {
    console.error('Push registration failed:', e);
  }
}
```

Also add cleanup on logout. In the `doLogout` function, add:

```javascript
  // Unregister push subscription
  if (Capacitor.isNativePlatform()) {
    const ntfyTopic = localStorage.getItem('ntfyTopic');
    if (ntfyTopic) {
      try {
        await api("DELETE", "/api/push/subscribe", { ntfyTopic });
      } catch (e) { /* ignore */ }
      localStorage.removeItem('ntfyTopic');
    }
  }
```

**Step 3: Sync Capacitor project**

Run: `make mobile-sync`

Expected: Sync completes. The `@capacitor/push-notifications` plugin is registered in the Android project.

**Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json frontend/src/app.js
git commit -m "feat: add native push notification registration for mobile app"
```

---

### Task 10: Fix broken notification tests

**Files:**
- Modify: `internal/notifications/notifications_test.go`
- Modify: `internal/notifications/integration_test.go`

The existing tests reference old `WebhookURL`/`BaseURL` fields and old `NewService` signature. Update them to match the current code.

**Step 1: Fix notifications_test.go**

In `notifications_test.go`:
- Change all `NewService(database)` calls to `NewService(database, "http://localhost:8080")`
- Update the `Settings` struct usage: replace `WebhookURL` with `Provider`/`ProviderConfig`, remove `BaseURL`
- Remove `TestSendWebhook` (it tests a `sendWebhook` method that no longer exists) or update it
- Update `TestBuildPayload` to match the current `buildPayload` signature
- Update `TestUpdateSettings` / `TestGetSettings_NotFound` to use current field names

**Step 2: Fix integration_test.go**

In `integration_test.go`:
- Change `NewService(database)` to `NewService(database, "http://localhost:8080")`
- Replace `WebhookURL` / `BaseURL` with `Provider: "webhook"` and `ProviderConfig: \`{"key": "` + server.URL + `"}\``
- Register the webhook provider on the service: `notifySvc.RegisterProvider("webhook", NewWebhookProvider())`

**Step 3: Run all notification tests**

Run: `go test ./internal/notifications/ -v -count=1`

Expected: ALL tests pass.

**Step 4: Commit**

```bash
git add internal/notifications/notifications_test.go internal/notifications/integration_test.go
git commit -m "fix: update notification tests for provider-based architecture"
```

---

### Task 11: Update E2E test for notification settings

**Files:**
- Modify: `tests/e2e/tests/pushover-settings.spec.ts` — rename and update for ntfy

**Step 1: Rename the test file**

```bash
mv tests/e2e/tests/pushover-settings.spec.ts tests/e2e/tests/notification-settings.spec.ts
```

**Step 2: Update the test**

Rewrite the E2E test to:
- Test admin configuring ntfy server URL instead of Pushover app token
- Test member seeing notification checkboxes (no Pushover user key)
- Test saving notification preferences

The test should look for:
- `#ntfy-server-url` input instead of `#pushover-app-token`
- `#save-ntfy-settings` button instead of `#save-pushover-settings`
- Success message "ntfy settings saved"
- Notification checkboxes still work

**Step 3: Run E2E tests**

Run: `make test-e2e` (or the specific notification test)

Expected: Tests pass with updated selectors.

**Step 4: Commit**

```bash
git add tests/e2e/tests/
git commit -m "test: update E2E tests for ntfy notification settings"
```

---

### Task 12: Full build + integration verification

**Step 1: Run all Go tests**

Run: `make test`

Expected: All tests pass.

**Step 2: Build the full app**

Run: `make build`

Expected: Binary builds successfully.

**Step 3: Build mobile app**

Run: `make mobile-sync`

Expected: Capacitor sync completes.

**Step 4: Manual smoke test**

Start dev server: `make dev`

Verify:
1. Open settings page — no Pushover UI visible
2. Admin sees ntfy server URL input in admin settings
3. User sees notification checkboxes (mentions, thread replies, all messages)
4. Saving notification preferences works

**Step 5: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final cleanup for native notifications"
```

---

## Summary of Files Changed

**Created:**
- `internal/db/migrations/012_native_push_notifications.sql`
- `internal/notifications/ntfy.go`
- `internal/notifications/ntfy_test.go`

**Modified:**
- `internal/notifications/notifications.go` — push subscription CRUD, updated sendToUser, ReloadNtfyProvider
- `internal/notifications/provider.go` — updated comment
- `internal/notifications/service_test.go` — added push subscription tests
- `internal/notifications/notifications_test.go` — fixed for current architecture
- `internal/notifications/integration_test.go` — fixed for current architecture
- `internal/api/api.go` — push endpoints, admin settings for ntfy
- `cmd/app/main.go` — ntfy provider registration
- `frontend/src/app.js` — browser notifications, ntfy admin UI, simplified settings, native push registration
- `mobile/package.json` — added @capacitor/push-notifications
- `tests/e2e/tests/notification-settings.spec.ts` — renamed from pushover, updated

**Deleted:**
- `internal/notifications/pushover.go`
- `internal/notifications/pushover_test.go`
- `tests/e2e/tests/pushover-settings.spec.ts` (renamed)
