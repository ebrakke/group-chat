# Web Push PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Capacitor Android app with server-side Web Push (VAPID) notifications delivered through a PWA.

**Architecture:** Go server generates VAPID keys, stores browser push subscriptions, and sends Web Push notifications when messages are created. SvelteKit frontend subscribes via the Push API in the service worker and removes all Capacitor/native code.

**Tech Stack:** Go + `github.com/SherClockHolmes/webpush-go`, SvelteKit service worker + Push API, SQLite

**Spec:** `docs/superpowers/specs/2026-03-18-web-push-pwa-design.md`

---

## File Structure

### New Files
- `internal/notifications/webpush.go` — Web Push sending logic (VAPID, subscription management, delivery)
- `internal/notifications/webpush_test.go` — Tests for web push
- `internal/db/migrations/019_web_push_subscriptions.sql` — Migration: drop old table, create new
- `frontend/src/lib/push.svelte.ts` — Frontend push subscription manager

### Modified Files
- `internal/notifications/notifications.go` — Replace ntfy logic in `sendToUser()` with web push
- `internal/api/api.go` — Replace push handlers, add vapid-key + subscriptions endpoints
- `cmd/app/main.go` — VAPID key init on startup, remove ntfy provider registration
- `frontend/src/service-worker.ts` — Add push + notificationclick event handlers
- `frontend/src/lib/ws.svelte.ts` — Remove all notification functions and calls
- `frontend/src/lib/utils/platform.ts` — Remove `isNative()`, `getApiBase()`, simplify `getWsUrl()`
- `frontend/src/lib/api.ts` — Remove all `isNative()` branches, always use cookies
- `frontend/src/routes/+layout.svelte` — Remove native server config UI, simplify SW registration
- `frontend/src/routes/(app)/+layout.svelte` — Remove native imports, add push subscription init
- `frontend/src/lib/stores/auth.svelte.ts` — Remove `setSessionToken`/`getSessionToken` usage (dead after native removal)
- `frontend/src/lib/components/Sidebar.svelte` — Remove `stopNativeNotifications` import/call
- `frontend/src/routes/(app)/settings/+page.svelte` — Remove ntfy type reference
- `frontend/package.json` — Remove Capacitor dependencies
- `Makefile` — Remove mobile targets
- `go.mod` / `go.sum` — Add webpush-go dependency

### Deleted Files
- `frontend/src/lib/utils/native.ts`
- `mobile/` (entire directory)
- `internal/notifications/ntfy.go`
- `internal/notifications/ntfy_test.go`

---

### Task 1: Database Migration — Web Push Subscriptions

**Files:**
- Create: `internal/db/migrations/019_web_push_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Replace ntfy push_subscriptions with web push subscriptions
DROP TABLE IF EXISTS push_subscriptions;

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(endpoint, p256dh_key, auth_key)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subs_user ON web_push_subscriptions(user_id);

-- Remove ntfy app setting
DELETE FROM app_settings WHERE key = 'ntfy_server_url';
```

- [ ] **Step 2: Verify migration runs**

Run: `make build && ./relay-chat` (or `make dev`)
Expected: Server starts without errors, new table exists in SQLite.

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/019_web_push_subscriptions.sql
git commit -m "feat: add web_push_subscriptions migration (019)"
```

---

### Task 2: Web Push Go Module — VAPID Keys + Subscription CRUD

**Files:**
- Create: `internal/notifications/webpush.go`
- Create: `internal/notifications/webpush_test.go`

- [ ] **Step 1: Add webpush-go dependency**

Run: `go get github.com/SherClockHolmes/webpush-go`

- [ ] **Step 2: Write tests for VAPID key generation and subscription CRUD**

```go
// internal/notifications/webpush_test.go
package notifications

import (
	"fmt"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestEnsureVAPIDKeys(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")

	// First call generates keys
	pub, priv, err := svc.EnsureVAPIDKeys()
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys: %v", err)
	}
	if pub == "" || priv == "" {
		t.Fatal("expected non-empty keys")
	}

	// Second call returns same keys
	pub2, priv2, err := svc.EnsureVAPIDKeys()
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys second call: %v", err)
	}
	if pub2 != pub || priv2 != priv {
		t.Fatal("expected same keys on second call")
	}
}

func TestWebPushSubscriptionCRUD(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")

	// Create a test user
	database.Exec(`INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (1, 'test', 'x', 'Test', 'admin', datetime('now'))`)

	sub := WebPushSubscription{
		Endpoint:  "https://push.example.com/sub1",
		P256dh:    "BNcRdreAL...",
		Auth:      "tBHItJI5...",
		UserAgent: "Chrome/120",
	}

	// Subscribe
	err := svc.SaveWebPushSubscription(1, sub)
	if err != nil {
		t.Fatalf("SaveWebPushSubscription: %v", err)
	}

	// List
	subs, err := svc.GetWebPushSubscriptions(1)
	if err != nil {
		t.Fatalf("GetWebPushSubscriptions: %v", err)
	}
	if len(subs) != 1 {
		t.Fatalf("expected 1 subscription, got %d", len(subs))
	}
	if subs[0].Endpoint != sub.Endpoint {
		t.Fatalf("endpoint mismatch: %s", subs[0].Endpoint)
	}

	// Upsert (same endpoint = touch updated_at)
	err = svc.SaveWebPushSubscription(1, sub)
	if err != nil {
		t.Fatalf("SaveWebPushSubscription upsert: %v", err)
	}
	subs, _ = svc.GetWebPushSubscriptions(1)
	if len(subs) != 1 {
		t.Fatalf("expected 1 after upsert, got %d", len(subs))
	}

	// Unsubscribe
	err = svc.DeleteWebPushSubscription(sub.Endpoint)
	if err != nil {
		t.Fatalf("DeleteWebPushSubscription: %v", err)
	}
	subs, _ = svc.GetWebPushSubscriptions(1)
	if len(subs) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(subs))
	}
}

func TestWebPushSubscriptionLimit(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")
	database.Exec(`INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (1, 'test', 'x', 'Test', 'admin', datetime('now'))`)

	// Add 10 subscriptions (the max)
	for i := 0; i < 10; i++ {
		err := svc.SaveWebPushSubscription(1, WebPushSubscription{
			Endpoint: fmt.Sprintf("https://push.example.com/sub%d", i),
			P256dh:   "key",
			Auth:     "auth",
		})
		if err != nil {
			t.Fatalf("sub %d: %v", i, err)
		}
	}

	// 11th should fail
	err := svc.SaveWebPushSubscription(1, WebPushSubscription{
		Endpoint: "https://push.example.com/sub10",
		P256dh:   "key",
		Auth:     "auth",
	})
	if err == nil {
		t.Fatal("expected error for 11th subscription")
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/dev/code/relay-chat && go test ./internal/notifications/ -run TestEnsureVAPID -v`
Expected: FAIL — `EnsureVAPIDKeys` not defined

- [ ] **Step 4: Implement webpush.go**

```go
// internal/notifications/webpush.go
package notifications

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// WebPushSubscription represents a browser push subscription.
type WebPushSubscription struct {
	ID        int64  `json:"id"`
	Endpoint  string `json:"endpoint"`
	P256dh    string `json:"p256dh"`
	Auth      string `json:"auth"`
	UserAgent string `json:"userAgent"`
}

// EnsureVAPIDKeys checks for existing VAPID keys in app_settings,
// generates them if missing, and returns (publicKey, privateKey, error).
func (s *Service) EnsureVAPIDKeys() (string, string, error) {
	pub, pubErr := s.GetAppSetting("vapid_public_key")
	priv, privErr := s.GetAppSetting("vapid_private_key")

	if pubErr == nil && privErr == nil && pub != "" && priv != "" {
		return pub, priv, nil
	}

	// Generate new VAPID key pair
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", fmt.Errorf("generate VAPID keys: %w", err)
	}

	err = s.UpdateAppSettings(map[string]string{
		"vapid_public_key":  pub,
		"vapid_private_key": priv,
	})
	if err != nil {
		return "", "", fmt.Errorf("store VAPID keys: %w", err)
	}

	log.Printf("Generated new VAPID keys")
	return pub, priv, nil
}

// GetVAPIDPublicKey returns the VAPID public key.
func (s *Service) GetVAPIDPublicKey() (string, error) {
	return s.GetAppSetting("vapid_public_key")
}

const maxSubscriptionsPerUser = 10

// SaveWebPushSubscription stores or updates a web push subscription.
func (s *Service) SaveWebPushSubscription(userID int64, sub WebPushSubscription) error {
	// Check if this exact subscription already exists (upsert)
	var existingID int64
	err := s.db.QueryRow(
		`SELECT id FROM web_push_subscriptions WHERE endpoint = ? AND p256dh_key = ? AND auth_key = ?`,
		sub.Endpoint, sub.P256dh, sub.Auth,
	).Scan(&existingID)

	if err == nil {
		// Existing subscription — touch updated_at
		_, err = s.db.Exec(
			`UPDATE web_push_subscriptions SET user_id = ?, user_agent = ?, updated_at = ? WHERE id = ?`,
			userID, sub.UserAgent, time.Now().UTC().Format(time.RFC3339), existingID,
		)
		return err
	}

	// Check subscription limit
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id = ?`, userID).Scan(&count)
	if count >= maxSubscriptionsPerUser {
		return fmt.Errorf("maximum of %d push subscriptions reached", maxSubscriptionsPerUser)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth, sub.UserAgent, now, now,
	)
	return err
}

// GetWebPushSubscriptions returns all push subscriptions for a user.
func (s *Service) GetWebPushSubscriptions(userID int64) ([]WebPushSubscription, error) {
	rows, err := s.db.Query(
		`SELECT id, endpoint, p256dh_key, auth_key, user_agent FROM web_push_subscriptions WHERE user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []WebPushSubscription
	for rows.Next() {
		var sub WebPushSubscription
		if err := rows.Scan(&sub.ID, &sub.Endpoint, &sub.P256dh, &sub.Auth, &sub.UserAgent); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	return subs, rows.Err()
}

// DeleteWebPushSubscription removes a subscription by endpoint.
func (s *Service) DeleteWebPushSubscription(endpoint string) error {
	_, err := s.db.Exec(`DELETE FROM web_push_subscriptions WHERE endpoint = ?`, endpoint)
	return err
}

// webPushPayload is the JSON format sent to the browser's push handler.
type webPushPayload struct {
	Title   string              `json:"title"`
	Options webPushPayloadOpts  `json:"options"`
}

type webPushPayloadOpts struct {
	Body string              `json:"body"`
	Icon string              `json:"icon"`
	Data webPushPayloadData  `json:"data"`
}

type webPushPayloadData struct {
	Path      string `json:"path"`
	ChannelID int64  `json:"channelId"`
	ThreadID  *int64 `json:"threadId"`
}

// SendWebPush sends a push notification to all of a user's subscriptions.
func (s *Service) SendWebPush(subs []WebPushSubscription, payload Payload) {
	vapidPub, pubErr := s.GetAppSetting("vapid_public_key")
	vapidPriv, privErr := s.GetAppSetting("vapid_private_key")
	if pubErr != nil || privErr != nil || vapidPub == "" || vapidPriv == "" {
		return
	}

	// Build browser-native notification payload
	pushPayload := webPushPayload{
		Title: payload.Title,
		Options: webPushPayloadOpts{
			Body: fmt.Sprintf("%s: %s", payload.Sender, payload.Message),
			Icon: "/icon-192.png",
			Data: webPushPayloadData{
				Path:      payload.URL,
				ChannelID: payload.ChannelID,
			},
		},
	}

	payloadJSON, err := json.Marshal(pushPayload)
	if err != nil {
		log.Printf("web push: marshal payload: %v", err)
		return
	}

	// Get base URL for VAPID subject
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
				VAPIDPublicKey:  vapidPub,
				VAPIDPrivateKey: vapidPriv,
				Subscriber:      subject,
				Urgency:         webpush.UrgencyHigh,
				HTTPClient:      &http.Client{Timeout: 10 * time.Second},
			})
			if err != nil {
				log.Printf("web push send error (endpoint %s): %v", sub.Endpoint[:min(50, len(sub.Endpoint))], err)
				return
			}
			defer resp.Body.Close()

			// 410 Gone = subscription expired, clean it up
			if resp.StatusCode == http.StatusGone {
				log.Printf("web push: removing expired subscription %s", sub.Endpoint[:min(50, len(sub.Endpoint))])
				s.DeleteWebPushSubscription(sub.Endpoint)
			}
		}(sub)
	}
}

```

Note: Go 1.21+ has a builtin `min()` — no custom helper needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/notifications/ -run "TestEnsureVAPID|TestWebPushSubscription" -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add internal/notifications/webpush.go internal/notifications/webpush_test.go go.mod go.sum
git commit -m "feat: add web push VAPID key management and subscription CRUD"
```

---

### Task 3: Wire Web Push into Notification Delivery

**Files:**
- Modify: `internal/notifications/notifications.go:264-300` (sendToUser method)
- Modify: `cmd/app/main.go:91-101` (remove ntfy, add VAPID init)

- [ ] **Step 1: Replace ntfy logic in sendToUser()**

In `internal/notifications/notifications.go`, replace the ntfy push section in `sendToUser()` (lines 286-300):

Old code:
```go
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
```

New code:
```go
	// Try web push subscriptions first
	subs, _ := s.GetWebPushSubscriptions(userID)
	if len(subs) > 0 {
		s.SendWebPush(subs, payload)
		return
	}
```

- [ ] **Step 2: Remove ntfy methods from notifications.go**

Delete the following methods entirely:
- `ReloadNtfyProvider()` (lines 55-70)
- `SubscribePush()` (lines 386-397)
- `UnsubscribePush()` (lines 399-406)
- `GetPushTopics()` (lines 408-425)

Also remove the `context` import if no longer used (check — `Send()` doesn't use it but `sendToUser()` still uses it for webhook fallback). Keep the import since webhook uses `context.WithTimeout`.

- [ ] **Step 3: Update cmd/app/main.go**

Replace lines 96-101 (ntfy registration):
```go
	// Register ntfy provider if configured
	ntfyURL, err := notifySvc.GetAppSetting("ntfy_server_url")
	if err == nil && ntfyURL != "" {
		notifySvc.RegisterProvider("ntfy", notifications.NewNtfyProvider(ntfyURL))
		log.Printf("Ntfy provider enabled: %s", ntfyURL)
	}
```

With VAPID key initialization:
```go
	// Ensure VAPID keys exist for web push
	if _, _, err := notifySvc.EnsureVAPIDKeys(); err != nil {
		log.Printf("Warning: VAPID key setup failed: %v", err)
	}
```

- [ ] **Step 4: Delete ntfy provider files**

```bash
rm internal/notifications/ntfy.go internal/notifications/ntfy_test.go
```

- [ ] **Step 5: Verify build compiles**

Run: `go build ./...`
Expected: No errors

- [ ] **Step 6: Run existing tests**

Run: `go test ./internal/notifications/ -v`
Expected: All pass (ntfy-specific tests are deleted)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire web push delivery into sendToUser, remove ntfy provider"
```

---

### Task 4: API Endpoints — VAPID Key + Push Subscribe/Unsubscribe

**Files:**
- Modify: `internal/api/api.go:129-133` (routes), `internal/api/api.go:1458-1514` (handlers)

- [ ] **Step 1: Update route registration**

In `internal/api/api.go`, find the push routes (around line 131-133) and replace:

Old:
```go
	h.mux.HandleFunc("POST /api/push/subscribe", h.handlePushSubscribe)
	h.mux.HandleFunc("DELETE /api/push/subscribe", h.handlePushUnsubscribe)
```

New:
```go
	h.mux.HandleFunc("GET /api/push/vapid-key", h.handleGetVAPIDKey)
	h.mux.HandleFunc("POST /api/push/subscribe", h.handlePushSubscribe)
	h.mux.HandleFunc("DELETE /api/push/subscribe", h.handlePushUnsubscribe)
	h.mux.HandleFunc("GET /api/push/subscriptions", h.handleGetPushSubscriptions)
```

- [ ] **Step 2: Replace handler implementations**

Replace `handlePushSubscribe` and `handlePushUnsubscribe` (lines 1458-1514) with:

```go
func (h *Handler) handleGetVAPIDKey(w http.ResponseWriter, r *http.Request) {
	key, err := h.notifications.GetVAPIDPublicKey()
	if err != nil || key == "" {
		writeErr(w, http.StatusServiceUnavailable, errors.New("VAPID keys not configured"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": key})
}

func (h *Handler) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		Endpoint  string `json:"endpoint"`
		P256dh    string `json:"p256dh"`
		Auth      string `json:"auth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid request"))
		return
	}
	if req.Endpoint == "" || req.P256dh == "" || req.Auth == "" {
		writeErr(w, http.StatusBadRequest, errors.New("endpoint, p256dh, and auth are required"))
		return
	}

	sub := notifications.WebPushSubscription{
		Endpoint:  req.Endpoint,
		P256dh:    req.P256dh,
		Auth:      req.Auth,
		UserAgent: r.UserAgent(),
	}
	if err := h.notifications.SaveWebPushSubscription(user.ID, sub); err != nil {
		writeErr(w, http.StatusConflict, errors.New(err.Error()))
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
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid request"))
		return
	}
	if req.Endpoint == "" {
		writeErr(w, http.StatusBadRequest, errors.New("endpoint is required"))
		return
	}

	if err := h.notifications.DeleteWebPushSubscription(req.Endpoint); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to unsubscribe"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleGetPushSubscriptions(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	subs, err := h.notifications.GetWebPushSubscriptions(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to get subscriptions"))
		return
	}
	if subs == nil {
		subs = []notifications.WebPushSubscription{}
	}
	writeJSON(w, http.StatusOK, subs)
}
```

- [ ] **Step 3: Remove handleGetProviders and clean up admin settings handlers**

Remove the `handleGetProviders` handler and its route registration (`GET /api/notifications/providers` at line 129).

In `handleGetAdminSettings` (around line 1537-1541), remove the ntfy key mapping:
```go
		case "ntfy_server_url":
			response["ntfyServerUrl"] = v
```

In `handleUpdateAdminSettings` (around line 1573-1578), remove the ntfy reload block:
```go
	// Reload ntfy provider if URL was updated
	if _, hasNtfyURL := req["ntfy_server_url"]; hasNtfyURL {
		if err := h.notifications.ReloadNtfyProvider(); err != nil {
			log.Printf("Warning: failed to reload ntfy provider: %v", err)
		}
	}
```

**This is critical** — without removing `ReloadNtfyProvider()` call, the build will fail after Task 3 deletes the method.

- [ ] **Step 4: Verify build compiles**

Run: `go build ./...`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add web push API endpoints (vapid-key, subscribe, unsubscribe, list)"
```

---

### Task 5: Service Worker — Push + Notification Click Handlers

**Files:**
- Modify: `frontend/src/service-worker.ts`

- [ ] **Step 1: Add push event handlers to service worker**

Append to the end of `frontend/src/service-worker.ts` (after the fetch handler):

```typescript
// --- Web Push Notifications ---

sw.addEventListener('push', (event) => {
	if (!event.data) return;

	const handlePush = async () => {
		const data = event.data!.json();
		// Skip notification if user is actively looking at the app
		const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
		if (clients.some((c) => c.focused)) return;

		await sw.registration.showNotification(data.title, data.options);
	};

	event.waitUntil(handlePush());
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = event.notification.data?.path;
	if (!path) return;

	const url = new URL(path, sw.location.origin).href;

	event.waitUntil(
		sw.clients.matchAll({ type: 'window' }).then((clients) => {
			const focused = clients.find((c) => c.focused);
			if (focused) return focused.navigate(url);
			return sw.clients.openWindow(url);
		})
	);
});
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service-worker.ts
git commit -m "feat: add push notification handlers to service worker"
```

---

### Task 6: Frontend Push Subscription Module

**Files:**
- Create: `frontend/src/lib/push.svelte.ts`

- [ ] **Step 1: Create push subscription manager**

```typescript
// frontend/src/lib/push.svelte.ts
import { api } from './api';

let subscribed = $state(false);
let permissionState = $state<NotificationPermission>('default');

export const pushState = {
	get subscribed() { return subscribed; },
	get permission() { return permissionState; },
};

/**
 * Initialize push notifications:
 * 1. Check current permission and subscription state
 * 2. If already subscribed, re-send to server (in case it was lost)
 * 3. If permission granted but not subscribed, subscribe
 */
export async function initPush(): Promise<void> {
	if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;

	permissionState = Notification.permission;
	if (permissionState === 'denied') return;

	try {
		const reg = await navigator.serviceWorker.ready;
		const existing = await reg.pushManager.getSubscription();

		if (existing) {
			// Re-sync with server
			await sendSubscriptionToServer(existing);
			subscribed = true;
			return;
		}

		// If permission already granted (from earlier prompt), auto-subscribe
		if (permissionState === 'granted') {
			await subscribe(reg);
		}
	} catch (e) {
		console.error('Push init error:', e);
	}
}

/**
 * Request permission and subscribe. Call this from a user action (button click).
 */
export async function requestAndSubscribe(): Promise<void> {
	if (!('PushManager' in window)) return;

	const permission = await Notification.requestPermission();
	permissionState = permission;
	if (permission !== 'granted') return;

	try {
		const reg = await navigator.serviceWorker.ready;
		await subscribe(reg);
	} catch (e) {
		console.error('Push subscribe error:', e);
	}
}

/**
 * Unsubscribe from push (call on logout).
 */
export async function unsubscribePush(): Promise<void> {
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (sub) {
			const endpoint = sub.endpoint;
			await sub.unsubscribe();
			await api('DELETE', '/api/push/subscribe', { endpoint });
		}
		subscribed = false;
	} catch (e) {
		console.error('Push unsubscribe error:', e);
	}
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<void> {
	const { publicKey } = await api<{ publicKey: string }>('GET', '/api/push/vapid-key');

	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey),
	});

	await sendSubscriptionToServer(sub);
	subscribed = true;
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
	const key = sub.getKey('p256dh');
	const auth = sub.getKey('auth');
	if (!key || !auth) return;

	await api('POST', '/api/push/subscribe', {
		endpoint: sub.endpoint,
		p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
		auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
	});
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/push.svelte.ts
git commit -m "feat: add frontend push subscription manager"
```

---

### Task 7: Remove Capacitor + Native Code from Frontend

**Files:**
- Delete: `frontend/src/lib/utils/native.ts`
- Modify: `frontend/src/lib/utils/platform.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/ws.svelte.ts`
- Modify: `frontend/src/routes/+layout.svelte`
- Modify: `frontend/src/routes/(app)/+layout.svelte`
- Modify: `frontend/src/lib/components/Sidebar.svelte`
- Modify: `frontend/package.json`

- [ ] **Step 1: Delete native.ts**

```bash
rm frontend/src/lib/utils/native.ts
```

- [ ] **Step 2: Simplify platform.ts**

Replace entire file with:
```typescript
export function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

export function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
```

- [ ] **Step 3: Simplify api.ts**

Replace entire file with:
```typescript
import type { FileAttachment, User } from './types';

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const opts: RequestInit = { method, headers, credentials: 'include' };

  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  let data: { error?: string } = {};
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text) as { error?: string };
  } catch {
    // non-JSON response (e.g. 502 HTML)
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function uploadFile(file: globalThis.File, messageId?: number): Promise<FileAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (messageId) form.append('messageId', String(messageId));

  const res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as FileAttachment;
}

export async function uploadAvatar(file: globalThis.File): Promise<User> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/account/avatar', { method: 'PUT', body: form, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as User;
}

export async function deleteAvatar(): Promise<User> {
  return api<User>('DELETE', '/api/account/avatar');
}
```

- [ ] **Step 4: Update auth.svelte.ts — remove session token usage**

The old `api.ts` exported `setSessionToken` and `getSessionToken` for Capacitor Bearer auth. Now that we always use cookies, these are dead code. Update `frontend/src/lib/stores/auth.svelte.ts`:

Replace the import (line 1):
```typescript
import { api, setSessionToken, getSessionToken, uploadAvatar, deleteAvatar } from '$lib/api';
```
With:
```typescript
import { api, uploadAvatar, deleteAvatar } from '$lib/api';
```

In `checkAuth()` (lines 20-21), remove the token restore:
```typescript
      const token = getSessionToken();
      if (token) setSessionToken(token);
```

In `login()` (line 45), `bootstrap()` (line 56), `signup()` (line 67), remove `setSessionToken(res.token);` calls.

In `logout()` (line 77), remove `setSessionToken(null);`.

The server handles session cookies via `Set-Cookie` headers — no client-side token management needed.

- [ ] **Step 5: Clean up ws.svelte.ts**

Replace entire file with (removes showBrowserNotification, showNativeNotification, isNative, authStore imports):
```typescript
import { getWsUrl } from './utils/platform';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';
import { calendarStore } from './stores/calendar.svelte';
import { threadStore } from './stores/threads';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  connected = $state(false);

  connect() {
    const url = getWsUrl();

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempt = 0;
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private handleEvent(data: any) {
    const payload = data.payload;
    switch (data.type) {
      case 'new_message':
        if (payload) {
          messageStore.addMessage(payload);
          if (payload.channelId !== channelStore.activeChannelId) {
            channelStore.updateUnread(payload.channelId, 1, false);
          }
        }
        break;
      case 'new_reply':
        if (payload) {
          messageStore.incrementReplyCount(payload.parentId);
          messageStore.addReplyParticipant(payload.parentId, {
            userId: payload.userId,
            username: payload.username,
            displayName: payload.displayName,
            avatarUrl: payload.avatarUrl
          });
          threadStore.addReply(payload);
        }
        break;
      case 'reaction_added':
        if (payload) {
          messageStore.updateReaction(payload.messageId, payload.emoji, payload.userId, true, payload.displayName);
        }
        break;
      case 'reaction_removed':
        if (payload) {
          messageStore.updateReaction(payload.messageId, payload.emoji, payload.userId, false);
        }
        break;
      case 'message_edited':
        if (payload) {
          messageStore.updateMessage(payload);
          threadStore.updateReply(payload);
        }
        break;
      case 'message_deleted':
        if (payload) {
          messageStore.removeMessage(payload.messageId);
          threadStore.removeReply(payload.messageId);
        }
        break;
      case 'channel_created':
        if (payload) {
          channelStore.addChannel({ id: payload.id, name: payload.name });
        }
        break;
      case 'calendar_event_created':
        if (payload) calendarStore.addEvent(payload);
        break;
      case 'calendar_event_updated':
        if (payload) calendarStore.updateEvent(payload);
        break;
      case 'calendar_event_deleted':
        if (payload) calendarStore.removeEvent(payload.id);
        break;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export const wsManager = new WebSocketManager();
```

- [ ] **Step 6: Simplify root +layout.svelte**

Replace entire file with (removes native server config, simplifies SW + notification to just SW registration):
```svelte
<script lang="ts">
  import '../app.css';
  import '$lib/stores/theme.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let { children } = $props();

  const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite'];

  function isPublicRoute(pathname: string): boolean {
    return publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));
  }

  onMount(async () => {
    await authStore.checkHasUsers();
    await authStore.checkAuth();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  });

  $effect(() => {
    if (authStore.loading) return;

    const pathname = $page.url.pathname;

    if (!authStore.hasUsers && pathname !== '/bootstrap') {
      goto('/bootstrap');
      return;
    }

    if (!authStore.isLoggedIn && !isPublicRoute(pathname)) {
      goto('/login');
      return;
    }

    if (authStore.isLoggedIn && (isPublicRoute(pathname) || pathname === '/')) {
      goto('/channels');
      return;
    }
  });
</script>

{#if authStore.loading}
  <div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
    <p>Loading...</p>
  </div>
{:else}
  {@render children()}
{/if}
```

- [ ] **Step 7: Update (app)/+layout.svelte**

Remove native imports and add push init. Replace the script section:

Old imports (lines 8-9):
```typescript
  import { isNative, isMobile } from '$lib/utils/platform';
  import { initNativeNotifications, setupBackButton } from '$lib/utils/native';
```

New imports:
```typescript
  import { isMobile } from '$lib/utils/platform';
  import { initPush } from '$lib/push';
```

Replace `onMount` (lines 33-77):
```typescript
  onMount(async () => {
    channelStore.load();
    wsManager.connect();
    window.addEventListener('keydown', handleKeydown);

    // Initialize web push notifications
    initPush();
  });
```

- [ ] **Step 8: Update Sidebar.svelte logout**

Find and remove the `stopNativeNotifications` import and call. In `frontend/src/lib/components/Sidebar.svelte`:

Remove line 5:
```typescript
  import { stopNativeNotifications } from '$lib/utils/native';
```

Add import:
```typescript
  import { unsubscribePush } from '$lib/push';
```

Replace the logout button handler (around line 169-172):
Old:
```typescript
        await stopNativeNotifications();
        authStore.logout();
```
New:
```typescript
        await unsubscribePush();
        authStore.logout();
```

- [ ] **Step 9: Remove ntfy reference from settings page**

In `frontend/src/routes/(app)/settings/+page.svelte`, update the admin settings type (line 71):
Old: `api<{ baseUrl?: string; ntfyServerUrl?: string }>`
New: `api<{ baseUrl?: string }>`

- [ ] **Step 10: Remove Capacitor dependencies**

Run: `cd /home/dev/code/relay-chat/frontend && bun remove @capacitor/app @capacitor/core @capacitor/local-notifications @capawesome-team/capacitor-android-foreground-service`

- [ ] **Step 11: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: remove Capacitor/native code, wire up web push subscription"
```

---

### Task 8: Remove Mobile Directory + Makefile Targets

**Files:**
- Delete: `mobile/` (entire directory)
- Modify: `Makefile`

- [ ] **Step 1: Delete mobile directory**

```bash
rm -rf mobile/
```

- [ ] **Step 2: Remove mobile Makefile targets**

In `Makefile`, remove the `.PHONY` entries for `mobile-sync`, `mobile-build`, `mobile-open` and delete the target blocks (lines 51-67 and any help text referencing them on lines 17-19).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove mobile/ directory and Makefile targets"
```

---

### Task 9: Full Build + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `make build`
Expected: Frontend + Go binary build successfully

- [ ] **Step 2: Start server and verify**

Run: `make dev` (background)
Then:
- Open http://localhost:8080 in Chrome
- Log in
- Check browser console for push subscription (should see POST to `/api/push/subscribe`)
- Check VAPID key endpoint: `curl http://localhost:8080/api/push/vapid-key` — should return `{"publicKey":"..."}`
- Verify notification permission prompt appears
- Verify no Capacitor-related console errors

- [ ] **Step 3: Test notification delivery**

- Open two browser windows logged in as different users
- Send a message from user A
- Minimize user B's window, send another message from user A
- User B should receive an OS push notification

- [ ] **Step 4: Run E2E tests**

Run: `make test-e2e`
Expected: All existing tests pass (notification-specific tests may need updates if any reference native/ntfy)

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
