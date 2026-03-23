# Notification Reliability & ntfy Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix PWA push notification reliability issues and add ntfy as a secondary notification channel for reliable mobile delivery.

**Architecture:** Fix the service worker silent push bug (iOS subscription revocation), add notification tags for OS-level dedup, add an ntfy HTTP client that publishes to per-user topics on an external ntfy server (defaulting to ntfy.sh), create a separate admin settings page, and add a test notification button with BroadcastChannel verification.

**Tech Stack:** Go (backend), SvelteKit 5 with Svelte runes (frontend), Tailwind CSS v4, SQLite (modernc.org/sqlite), webpush-go, ntfy HTTP API

**Spec:** `docs/superpowers/specs/2026-03-23-notification-reliability-design.md`

---

## File Structure

### Backend (Go)
- **Modify:** `internal/notifications/provider.go` — add `MessageID` field to `Payload` struct
- **Modify:** `internal/notifications/notifications.go` — add `MessageID` to `buildPayload()`, restructure `sendToUser()` and `SendDM()` from fallback to parallel delivery, add ntfy publishing
- **Modify:** `internal/notifications/webpush.go` — add `Tag` field to web push payload structs
- **Create:** `internal/notifications/ntfy.go` — ntfy HTTP client (publish to topics, topic generation)
- **Create:** `internal/notifications/ntfy_test.go` — unit tests for ntfy client
- **Modify:** `internal/api/api.go` — add `/api/push/test` endpoint, add ntfy admin settings endpoints, add ntfy user setup endpoint
- **Create:** `internal/db/migrations/025_ntfy_support.sql` — add `ntfy_topic` column to users, add ntfy app_settings
- **Modify:** `cmd/app/main.go` — initialize ntfy settings on startup

### Frontend (SvelteKit)
- **Modify:** `frontend/src/service-worker.ts` — remove focus check, add tag support, add BroadcastChannel for test notifications
- **Modify:** `frontend/src/lib/push.svelte.ts` — add subscription health check on every init
- **Create:** `frontend/src/routes/(app)/settings/admin/+page.svelte` — new admin settings page (branding, invites, bots, ntfy)
- **Modify:** `frontend/src/routes/(app)/settings/+page.svelte` — remove admin sections, add ntfy setup UI, add test notification button

---

## Task 1: Fix Service Worker Silent Push Bug

**Files:**
- Modify: `frontend/src/service-worker.ts` (lines 68-81)

This is the highest-value, lowest-risk change. The current service worker skips `showNotification()` when the user has a focused window, causing Safari to count it as a silent push and revoke the subscription after ~3 occurrences.

- [ ] **Step 1: Update the push event handler to always show notifications**

Replace the push handler (lines 68-81) with an unconditional version. Note: even when `event.data` is null, we show a generic notification to avoid Safari counting it as a silent push:

```typescript
sw.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      if (!event.data) {
        await sw.registration.showNotification('New message', {});
        return;
      }
      const data = event.data.json();
      await sw.registration.showNotification(data.title, data.options);

      // If this is a test notification, tell the page it arrived
      if (data.test) {
        const bc = new BroadcastChannel('push-test');
        bc.postMessage({ received: true });
        bc.close();
      }
    })()
  );
});
```

- [ ] **Step 2: Verify the service worker compiles**

Run: `cd frontend && bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service-worker.ts
git commit -m "fix: remove focus check from service worker push handler

Safari revokes push subscriptions after ~3 silent pushes. The old code
skipped showNotification() when the user had a focused window, which
Safari counted as silent pushes. Now every push unconditionally displays.
Also adds BroadcastChannel support for test notification verification."
```

---

## Task 2: Add MessageID to Payload and Tag to Web Push

**Files:**
- Modify: `internal/notifications/provider.go` (line 22-32)
- Modify: `internal/notifications/notifications.go` (lines 185-214, 336-343)
- Modify: `internal/notifications/webpush.go` (lines 108-143)

- [ ] **Step 1: Add MessageID to the Payload struct**

In `internal/notifications/provider.go`, add `MessageID` to the `Payload` struct:

```go
type Payload struct {
	Title            string
	Message          string
	Sender           string
	Channel          string
	ChannelID        int64
	MessageID        int64
	URL              string
	Timestamp        string
	NotificationType string
	ThreadContext    string
}
```

- [ ] **Step 2: Set MessageID in buildPayload()**

In `internal/notifications/notifications.go`, update `buildPayload()` (around line 205) to include the message ID:

```go
return Payload{
	Title:     "New message in #" + channelName,
	Message:   content,
	Sender:    msg.DisplayName,
	Channel:   channelName,
	ChannelID: msg.ChannelID,
	MessageID: msg.ID,
	URL:       url,
	Timestamp: msg.CreatedAt,
}
```

Also update the DM payload in `SendDM()` (around line 336) to include `MessageID: msg.ID`.

- [ ] **Step 3: Add Tag field to web push payload structs**

In `internal/notifications/webpush.go`, add `Tag` to `webPushPayloadOpts`:

```go
type webPushPayloadOpts struct {
	Body string             `json:"body"`
	Icon string             `json:"icon"`
	Tag  string             `json:"tag"`
	Data webPushPayloadData `json:"data"`
}
```

- [ ] **Step 4: Set the tag when building the push payload**

In `SendWebPush()` (around line 133), add the tag:

```go
pushPayload := webPushPayload{
	Title: payload.Title,
	Options: webPushPayloadOpts{
		Body: fmt.Sprintf("%s: %s", payload.Sender, payload.Message),
		Icon: "/icon-192.png",
		Tag:  fmt.Sprintf("msg-%d", payload.MessageID),
		Data: webPushPayloadData{
			Path:      payload.URL,
			ChannelID: payload.ChannelID,
		},
	},
}
```

- [ ] **Step 5: Run tests**

Run: `make test`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add internal/notifications/provider.go internal/notifications/notifications.go internal/notifications/webpush.go
git commit -m "feat: add notification tags for OS-level dedup

Add MessageID to Payload struct, set it in buildPayload() and SendDM().
Web push payloads now include a tag field (msg-{id}) so the OS can
collapse duplicate notifications for the same message."
```

---

## Task 3: Restructure sendToUser() and SendDM() for Parallel Delivery

**Files:**
- Modify: `internal/notifications/notifications.go` (lines 276-317, 319-380)

Currently `sendToUser()` tries web push first and returns early, only falling back to webhook if there are no push subscriptions. Change to fire all configured providers in parallel.

- [ ] **Step 1: Restructure sendToUser() for parallel delivery**

Replace `sendToUser()` (lines 276-317) with:

```go
func (s *Service) sendToUser(userID int64, msg *messages.Message, channelName string) {
	if !s.shouldNotify(userID, msg) {
		return
	}

	payload := s.buildPayload(msg, channelName)

	// Web push (always try)
	subs, _ := s.GetWebPushSubscriptions(userID)
	if len(subs) > 0 {
		log.Printf("Sending web push to user %d (%d subscriptions)", userID, len(subs))
		s.SendWebPush(subs, payload)
	}

	// ntfy (if enabled and user has a topic)
	s.sendNtfy(userID, payload)

	// Webhook fallback (if configured)
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
```

- [ ] **Step 2: Restructure SendDM() for parallel delivery**

In `SendDM()` (starting at line 319), make these specific changes:
1. Remove the `return` on line 350 (after `s.SendWebPush(subs, payload)`) so execution continues
2. Add `s.sendNtfy(recipientID, payload)` after the web push block (after the closing `}` of `if len(subs) > 0`)
3. Keep the webhook fallback code at the end (it will now also run even when web push subscriptions exist)

- [ ] **Step 3: Add a stub sendNtfy() method**

Add a temporary stub at the end of `notifications.go` so the code compiles:

```go
// sendNtfy sends a notification via ntfy if enabled and the user has a topic.
// Implemented in ntfy.go.
```

Actually, we'll create the real implementation in Task 5. For now, add a minimal stub in `notifications.go`:

```go
func (s *Service) sendNtfy(userID int64, payload Payload) {
	// Will be implemented in ntfy.go
}
```

- [ ] **Step 4: Run tests**

Run: `make test`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add internal/notifications/notifications.go
git commit -m "refactor: change notification delivery from fallback to parallel

sendToUser() and SendDM() now fire web push, ntfy, and webhook in
parallel instead of using web push as a gate that blocks webhook.
Adds a stub sendNtfy() method for the upcoming ntfy integration."
```

---

## Task 4: Database Migration for ntfy Support

**Files:**
- Create: `internal/db/migrations/025_ntfy_support.sql`

- [ ] **Step 1: Create the migration file**

Create `internal/db/migrations/025_ntfy_support.sql`:

```sql
-- Add ntfy topic column to users table
ALTER TABLE users ADD COLUMN ntfy_topic TEXT;

-- Add ntfy settings to app_settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_server_url', 'https://ntfy.sh');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_publish_token', '');
```

- [ ] **Step 2: Verify migration applies**

Run: `make dev` (which builds and starts the server, applying migrations)
Expected: Server starts successfully, no migration errors in logs.

- [ ] **Step 3: Verify the schema**

Run: `sqlite3 data/relay.db ".schema users" | grep ntfy`
Expected: Shows `ntfy_topic TEXT` column.

Run: `sqlite3 data/relay.db "SELECT key, value FROM app_settings WHERE key LIKE 'ntfy%'"`
Expected: Shows 3 rows: `ntfy_enabled|false`, `ntfy_server_url|https://ntfy.sh`, `ntfy_publish_token|`

- [ ] **Step 4: Commit**

```bash
git add internal/db/migrations/025_ntfy_support.sql
git commit -m "feat: add database migration for ntfy support

Adds ntfy_topic column to users table and ntfy_enabled, ntfy_server_url,
ntfy_publish_token settings to app_settings (defaulting to ntfy.sh)."
```

---

## Task 5: ntfy HTTP Client

**Files:**
- Create: `internal/notifications/ntfy.go`
- Create: `internal/notifications/ntfy_test.go`
- Modify: `internal/notifications/notifications.go` — replace stub `sendNtfy()`

- [ ] **Step 1: Write tests for the ntfy client**

Create `internal/notifications/ntfy_test.go`:

```go
package notifications

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerateNtfyTopic(t *testing.T) {
	topic := generateNtfyTopic()
	if !strings.HasPrefix(topic, "relay-") {
		t.Errorf("topic should start with 'relay-', got: %s", topic)
	}
	if len(topic) < 20 {
		t.Errorf("topic should be at least 20 chars (relay- + uuid), got: %d", len(topic))
	}

	// Topics should be unique
	topic2 := generateNtfyTopic()
	if topic == topic2 {
		t.Error("two generated topics should not be equal")
	}
}

func TestPublishNtfy(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(200)
	}))
	defer server.Close()

	payload := Payload{
		Title:     "Test Title",
		Message:   "Test message",
		Sender:    "Alice",
		MessageID: 42,
		URL:       "https://example.com/#/channel/1",
	}

	err := publishNtfy(server.URL, "", "relay-test-topic", payload, "https://example.com/icon-192.png")
	if err != nil {
		t.Fatalf("publishNtfy failed: %v", err)
	}

	if receivedBody["topic"] != "relay-test-topic" {
		t.Errorf("expected topic 'relay-test-topic', got: %v", receivedBody["topic"])
	}
	if receivedBody["title"] != "Test Title" {
		t.Errorf("expected title 'Test Title', got: %v", receivedBody["title"])
	}
	if receivedAuth != "" {
		t.Errorf("expected no auth header for empty token, got: %s", receivedAuth)
	}
}

func TestPublishNtfyWithToken(t *testing.T) {
	var receivedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(200)
	}))
	defer server.Close()

	payload := Payload{Title: "Test", Message: "msg", Sender: "Bob", MessageID: 1}
	err := publishNtfy(server.URL, "tk_mytoken", "topic", payload, "")
	if err != nil {
		t.Fatalf("publishNtfy failed: %v", err)
	}

	if receivedAuth != "Bearer tk_mytoken" {
		t.Errorf("expected 'Bearer tk_mytoken', got: %s", receivedAuth)
	}
}

func TestPublishNtfyServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer server.Close()

	payload := Payload{Title: "Test", Message: "msg", Sender: "Bob", MessageID: 1}
	err := publishNtfy(server.URL, "", "topic", payload, "")
	if err == nil {
		t.Error("expected error for 500 response")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/dev/code/relay-chat && go test ./internal/notifications/ -run TestGenerateNtfy -v`
Expected: Compilation error — `generateNtfyTopic` not defined.

- [ ] **Step 3: Implement the ntfy client**

Create `internal/notifications/ntfy.go`:

```go
package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
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
		return fmt.Errorf("ntfy: server returned %d", resp.StatusCode)
	}

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
		log.Printf("ntfy: failed to send to user %d: %v", userID, err)
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
	rows, err := s.db.Query("SELECT id FROM users WHERE ntfy_topic IS NULL OR ntfy_topic = ''")
	if err != nil {
		return fmt.Errorf("ntfy: query users without topics: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		topic := generateNtfyTopic()
		if _, err := s.db.Exec("UPDATE users SET ntfy_topic = ? WHERE id = ?", topic, userID); err != nil {
			return fmt.Errorf("ntfy: store topic for user %d: %w", userID, err)
		}
	}
	return nil
}
```

- [ ] **Step 4: Remove the stub sendNtfy() from notifications.go**

Delete the stub `sendNtfy()` method added in Task 3 from `notifications.go` (the real implementation is now in `ntfy.go`).

- [ ] **Step 5: Check that uuid dependency is available**

Run: `cd /home/dev/code/relay-chat && go get github.com/google/uuid`

- [ ] **Step 6: Run the tests**

Run: `cd /home/dev/code/relay-chat && go test ./internal/notifications/ -v`
Expected: All tests pass, including the new ntfy tests.

- [ ] **Step 7: Run full test suite**

Run: `make test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add internal/notifications/ntfy.go internal/notifications/ntfy_test.go internal/notifications/notifications.go go.mod go.sum
git commit -m "feat: add ntfy HTTP client for reliable push notifications

Publishes notifications to per-user ntfy topics via HTTP API. Supports
optional Bearer token auth for self-hosted instances. Includes topic
generation (relay-{uuid}), regeneration, and bulk provisioning.
Replaces the stub sendNtfy() with real implementation."
```

---

## Task 6: Add Subscription Health Check

**Files:**
- Modify: `frontend/src/lib/push.svelte.ts`

On every app open, re-validate the push subscription and sync it with the server.

- [ ] **Step 1: Update initPush() to always sync subscription with server**

Read the current `initPush()` in `frontend/src/lib/push.svelte.ts` and update it to:
1. Always call `sendSubscriptionToServer()` if a subscription exists (upsert handles changes)
2. If subscription is null but permission is granted, re-subscribe
3. Update the `subscribed` state accordingly

The key change: instead of only sending the subscription on first creation, always send it on init to catch endpoint changes or stale server records.

Ensure `initPush()` calls `sendSubscriptionToServer(existingSub)` even when the subscription already exists (not just on first creation).

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/push.svelte.ts
git commit -m "feat: add push subscription health check on every app open

initPush() now always syncs the current subscription with the server,
catching expired endpoints and stale records. If the subscription is
null but permission was granted, it re-subscribes automatically."
```

---

## Task 7: Test Notification API Endpoint

**Files:**
- Modify: `internal/api/api.go` — add `POST /api/push/test` route and handler

- [ ] **Step 1: Add the route**

In `internal/api/api.go`, add the route near the other push endpoints (around line 148):

```go
h.mux.HandleFunc("POST /api/push/test", h.handlePushTest)
```

- [ ] **Step 2: Implement the handler**

Add the handler to `api.go`. Note: this codebase uses `h.requireAuth(r)` at the top of each handler for auth (not middleware wrapping), and `writeJSON()`/`writeErr()` helpers for responses:

```go
func (h *Handler) handlePushTest(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	// Build a test payload
	payload := notifications.Payload{
		Title:     "Test Notification",
		Message:   "If you see this, notifications are working!",
		Sender:    "System",
		MessageID: 0,
		URL:       "",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	// Send via web push with a test-specific tag and test flag
	subs, _ := h.notifications.GetWebPushSubscriptions(user.ID)
	if len(subs) > 0 {
		h.notifications.SendTestWebPush(subs, payload)
	}

	// Send via ntfy
	h.notifications.SendTestNtfy(user.ID, payload)

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
```

**Important:** Steps 2, 3, and 4 in this task must all be completed before attempting to compile, since `SendTestWebPush` and `SendTestNtfy` are defined in Steps 3 and 4.

- [ ] **Step 3: Add SendTestWebPush to webpush.go**

Add a method that sends a web push with the `test: true` flag and a unique tag:

```go
func (s *Service) SendTestWebPush(subs []WebPushSubscription, payload Payload) {
	vapidPub, pubErr := s.GetAppSetting("vapid_public_key")
	vapidPriv, privErr := s.GetAppSetting("vapid_private_key")
	if pubErr != nil || privErr != nil || vapidPub == "" || vapidPriv == "" {
		return
	}

	pushPayload := webPushTestPayload{
		Title: payload.Title,
		Test:  true,
		Options: webPushPayloadOpts{
			Body: payload.Message,
			Icon: "/icon-192.png",
			Tag:  fmt.Sprintf("test-%d", time.Now().UnixMilli()),
		},
	}

	payloadJSON, _ := json.Marshal(pushPayload)

	subject := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		subject = configuredURL
	}

	for _, sub := range subs {
		go func(sub WebPushSubscription) {
			resp, err := webpush.SendNotification(payloadJSON, &webpush.Subscription{
				Endpoint: sub.Endpoint,
				Keys: webpush.Keys{
					P256dh: sub.P256dh,
					Auth:   sub.Auth,
				},
			}, &webpush.Options{
				Subscriber:      subject,
				VAPIDPublicKey:  vapidPub,
				VAPIDPrivateKey: vapidPriv,
				Urgency:         webpush.UrgencyHigh,
			})
			if err != nil {
				log.Printf("web push test: send error: %v", err)
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusGone {
				s.DeleteWebPushSubscription(sub.Endpoint)
			}
		}(sub)
	}
}
```

Add the test payload struct:

```go
type webPushTestPayload struct {
	Title   string             `json:"title"`
	Test    bool               `json:"test"`
	Options webPushPayloadOpts `json:"options"`
}
```

- [ ] **Step 4: Add SendTestNtfy to ntfy.go**

```go
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
```

- [ ] **Step 5: Run tests**

Run: `make test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add internal/api/api.go internal/notifications/webpush.go internal/notifications/ntfy.go
git commit -m "feat: add test notification endpoint

POST /api/push/test sends a test notification through all configured
channels (web push + ntfy) with a test flag for BroadcastChannel
verification in the frontend."
```

---

## Task 8: ntfy Admin Settings API Endpoints

**Files:**
- Modify: `internal/api/api.go` — add ntfy settings to existing admin settings handler, add ntfy topic endpoint for users

- [ ] **Step 1: Add user ntfy topic endpoint route**

Add routes near the push endpoints (around line 148):

```go
h.mux.HandleFunc("GET /api/push/ntfy-topic", h.handleGetNtfyTopic)
h.mux.HandleFunc("POST /api/push/ntfy-topic/regenerate", h.handleRegenerateNtfyTopic)
```

- [ ] **Step 2: Implement the ntfy topic handlers**

Use the same `h.requireAuth(r)` + `writeJSON()`/`writeErr()` pattern as all other handlers in this file:

```go
func (h *Handler) handleGetNtfyTopic(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	topic, err := h.notifications.GetNtfyTopic(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to get ntfy topic"))
		return
	}

	// Get server URL for deep link construction
	serverURL, _ := h.notifications.GetAppSetting("ntfy_server_url")
	enabled, _ := h.notifications.GetAppSetting("ntfy_enabled")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"topic":     topic,
		"serverUrl": serverURL,
		"enabled":   enabled == "true",
	})
}

func (h *Handler) handleRegenerateNtfyTopic(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	topic, err := h.notifications.RegenerateNtfyTopic(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to regenerate ntfy topic"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"topic": topic})
}
```

- [ ] **Step 3: Ensure admin settings handler includes ntfy keys**

The existing `handleGetAdminSettings` and `handleUpdateAdminSettings` already read/write all `app_settings` generically. The handler has a key transformation switch that maps `base_url` → `baseUrl`, etc. Keys not in the switch fall through to the `default` case which passes them through as-is (snake_case). For consistency, add the ntfy keys to the switch:

In `handleGetAdminSettings` (around line 1740), add to the key transformation switch:
```go
case "ntfy_enabled":
	response["ntfyEnabled"] = v
case "ntfy_server_url":
	response["ntfyServerUrl"] = v
case "ntfy_publish_token":
	if v != "" {
		response["ntfyPublishToken"] = "********"
	} else {
		response["ntfyPublishToken"] = ""
	}
```

In `handleUpdateAdminSettings`, add the reverse transformations (`ntfyEnabled` → `ntfy_enabled`, etc.) and protect the publish token from being overwritten with the mask value `"********"`.

- [ ] **Step 4: Handle ntfy enable toggle side effects**

When the admin enables ntfy (sets `ntfy_enabled` to `true`), auto-generate topics for all users who don't have one. Add to `handleUpdateAdminSettings`:

```go
// After saving settings, if ntfy was just enabled, ensure all users have topics
if settings["ntfy_enabled"] == "true" {
	go h.notifications.EnsureAllNtfyTopics()
}
```

- [ ] **Step 5: Run tests**

Run: `make test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add ntfy API endpoints for admin settings and user topics

GET/POST /api/push/ntfy-topic for users to get/regenerate their topic.
Admin settings handler now includes ntfy keys with auto-provisioning
of topics when ntfy is enabled."
```

---

## Task 9: Admin Settings Page (Frontend)

**Files:**
- Create: `frontend/src/routes/(app)/settings/admin/+page.svelte`
- Modify: `frontend/src/routes/(app)/settings/+page.svelte` — remove admin-only sections

This is a large UI task. The admin settings page gets branding, invite codes, bots, and ntfy configuration. The user settings page keeps only personal settings.

- [ ] **Step 1: Create the admin settings page**

Create `frontend/src/routes/(app)/settings/admin/+page.svelte`. This page should:
- Load admin settings from `GET /api/admin/settings`
- Include sections for: Branding (app name, icon upload), Invite Codes, Bots, Notification Relay (ntfy)
- The ntfy section has:
  - Toggle: Enable/Disable ntfy relay
  - Status text showing "Enabled — using ntfy.sh" or "Disabled"
  - Collapsible "Advanced" section with: Server URL input (default: https://ntfy.sh), Publish token input (password field)
  - Count of users with ntfy topics configured
- Use the same patterns as the existing settings page (Svelte 5 runes, `$state`, `api` from `$lib/api`, `toastStore` for feedback)
- Redirect non-admin users with `goto('/settings')`

Follow the existing settings page structure for styling (card-based sections with headings, Tailwind classes). The admin-specific code to move is in the existing settings page at these locations:

- **Admin settings state** (lines 33-48): `baseUrl`, `appName`, icon preview/upload state
- **Branding state & functions** (lines 39-48, 141-215): `saveAppName()`, `uploadIcon()`, icon handling
- **User management state** (lines 27-31): `users`, `resetPasswordResult`, etc.
- **Invite state** (lines 51-54): `invites`, `inviteResult`, `creatingInvite`
- **Bot state** (lines 56-76): `bots`, `showCreateBotModal`, etc.
- **Admin settings loading** (lines 128-139): `GET /api/admin/settings` fetch
- **Admin settings save functions** (lines 141-215): `saveBaseUrl()`, `saveAppName()`, `uploadIcon()`

Copy these sections to the new admin page. The HTML template sections to move can be identified by their headings in the template (look for "Branding", "Invite", "Bot", "Users" sections).

- [ ] **Step 2: Remove admin sections from user settings page**

In `frontend/src/routes/(app)/settings/+page.svelte`:
- Remove the admin settings state variables (lines 27-48 approximately)
- Remove the admin-related functions (`saveBaseUrl`, `saveAppName`, `uploadIcon`, invite/bot functions)
- Remove the admin template sections (branding, invite codes, bots, user management)
- Remove the admin settings loading code from `onMount`
- Add a link to "/settings/admin" for admin users: `{#if authStore.user?.role === 'admin'}<a href="/settings/admin">Admin Settings →</a>{/if}`
- Keep: password change, avatar, theme, QR code session transfer, push notification settings

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(app\)/settings/admin/+page.svelte frontend/src/routes/\(app\)/settings/+page.svelte
git commit -m "feat: separate admin settings into dedicated page

Move branding, invite codes, bots, and user management to /settings/admin.
Add ntfy notification relay configuration section with enable toggle,
server URL, and publish token. User settings page now only shows personal
settings with a link to admin settings for admin users."
```

---

## Task 10: ntfy User Setup UI

**Files:**
- Modify: `frontend/src/routes/(app)/settings/+page.svelte` — add ntfy setup section

- [ ] **Step 1: Add ntfy setup section to user settings**

Add a "Reliable Notifications" section to the user settings page. This section:
- Only shows if ntfy is enabled (check via `GET /api/push/ntfy-topic` which returns `enabled` flag)
- Shows explanation: "Get notifications even when the app is closed. Requires the free ntfy app."
- Has a "Set up ntfy" button that opens a bottom sheet / modal
- The modal detects platform (via `navigator.userAgent`) and shows:
  - **Android**: "Install ntfy" (Play Store link) and "Open in ntfy" (deep link `ntfy://{serverUrl host}/{topic}`)
  - **iOS**: Step-by-step with tap-to-copy for server URL and topic name
  - **Desktop**: Tip about keeping browser open
- Shows a "Regenerate topic" button (calls `POST /api/push/ntfy-topic/regenerate`)
- After setup, shows option to disable browser push notifications to avoid duplicates

- [ ] **Step 2: Add test notification button**

Add a "Send test notification" button that:
- Calls `POST /api/push/test`
- Listens on `BroadcastChannel('push-test')` for 10 seconds
- Shows success if the message arrives, or platform-specific troubleshooting if it doesn't:
  - Android: "Check that Chrome is not battery-optimized in your device settings"
  - iOS: "Make sure this app is added to your home screen"
  - Desktop: "Notifications require your browser to be running"

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/\(app\)/settings/+page.svelte
git commit -m "feat: add ntfy setup UI and test notification button

Users can set up ntfy with one-tap on Android (deep link) or guided
steps on iOS. Includes platform detection, tap-to-copy, and a test
notification button with BroadcastChannel verification."
```

---

## Task 11: Auto-Generate ntfy Topics on Signup

**Files:**
- Modify: `cmd/app/main.go` — ensure ntfy topics are generated for new users

- [ ] **Step 1: Add ntfy topic generation to startup**

In `cmd/app/main.go`, after the notification service is initialized and VAPID keys are ensured, add:

```go
// Generate ntfy topics for any users missing them (handles existing users when ntfy is first enabled)
if enabled, err := notifySvc.GetAppSetting("ntfy_enabled"); err == nil && enabled == "true" {
	if err := notifySvc.EnsureAllNtfyTopics(); err != nil {
		log.Printf("Warning: failed to ensure ntfy topics: %v", err)
	}
}
```

- [ ] **Step 2: Verify new user signup generates a topic**

The `GetNtfyTopic()` method already generates a topic on first access (lazy generation). When a user visits their settings and the ntfy section loads, it calls `GET /api/push/ntfy-topic` which calls `GetNtfyTopic()` which generates one if missing. This is sufficient — no signup hook needed.

- [ ] **Step 3: Run full test suite**

Run: `make test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add cmd/app/main.go
git commit -m "feat: auto-generate ntfy topics for existing users on startup

When ntfy is enabled, ensures all users have ntfy topics on server
startup. New users get topics lazily on first settings page visit."
```

---

## Task 12: Full Integration Test

**Files:** No new files — this is a verification task.

- [ ] **Step 1: Build the full project**

Run: `make build`
Expected: Build succeeds (Go binary + frontend).

- [ ] **Step 2: Start the dev server**

Run: `make dev`
Expected: Server starts on :8080, no errors in logs, migrations applied.

- [ ] **Step 3: Verify admin settings page**

1. Log in as admin (admin/admin in dev mode)
2. Navigate to `/settings/admin`
3. Verify branding, invite codes, bots sections are present
4. Verify ntfy section shows toggle, defaulting to disabled
5. Enable ntfy, verify status shows "using ntfy.sh"

- [ ] **Step 4: Verify user settings page**

1. Navigate to `/settings`
2. Verify admin sections are removed
3. Verify "Admin Settings" link is shown for admin user
4. Verify ntfy setup section appears (after enabling ntfy in admin)
5. Verify test notification button is present

- [ ] **Step 5: Test the notification flow**

1. Click "Send test notification"
2. Verify a browser notification appears
3. Verify the BroadcastChannel success indicator works

- [ ] **Step 6: Run E2E tests**

Run: `make test-e2e`
Expected: All existing E2E tests pass (no regressions from settings page restructuring).

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration test issues"
```
