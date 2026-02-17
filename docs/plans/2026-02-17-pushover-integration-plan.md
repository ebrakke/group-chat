# Pushover Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add plugin-style notification provider system with built-in Pushover support and server-wide configuration.

**Architecture:** Provider interface implemented by Pushover and webhook providers. Admin configures Pushover app token; users choose provider and enter simple config (user key or URL). Provider registry validates and routes notifications.

**Tech Stack:** Go 1.21+, SQLite (modernc.org/sqlite), vanilla JavaScript, Bun build system

---

## Task 1: Database Migration for Provider-Based Notifications

**Files:**
- Create: `internal/db/migrations/008_provider_based_notifications.sql`

**Step 1: Write the migration SQL**

```sql
-- Drop old webhook-specific table
DROP TABLE IF EXISTS user_notification_settings;

-- New provider-agnostic settings table
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'webhook',
    provider_config TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    notify_mentions INTEGER NOT NULL DEFAULT 1,
    notify_thread_replies INTEGER NOT NULL DEFAULT 1,
    notify_all_messages INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Server-wide provider configuration (admin-managed)
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Store Pushover app token here
INSERT INTO app_settings (key, value, updated_at)
VALUES ('pushover_app_token', '', datetime('now'));
```

**Step 2: Test migration by building and running**

Run:
```bash
rm -f tmp/app.db tmp/relay.db
DATA_DIR=./tmp go run ./cmd/app/
```

Expected: Server starts, migration 008 runs, new tables created

**Step 3: Verify tables exist**

Run:
```bash
sqlite3 tmp/app.db "SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('user_notification_settings', 'app_settings');"
```

Expected: Both table schemas displayed

**Step 4: Commit**

```bash
git add internal/db/migrations/008_provider_based_notifications.sql
git commit -m "feat: add database migration for provider-based notifications

Introduces provider-agnostic notification settings and server-wide
app_settings table for admin configuration like Pushover app token."
```

---

## Task 2: Provider Interface Definition

**Files:**
- Create: `internal/notifications/provider.go`

**Step 1: Define provider interface and types**

```go
// internal/notifications/provider.go
package notifications

import "context"

// Provider delivers notifications via a specific channel (Pushover, webhook, etc.)
type Provider interface {
	// Send delivers a notification for a message
	Send(ctx context.Context, recipient Recipient, payload Payload) error

	// ValidateConfig checks if provider is properly configured
	ValidateConfig() error
}

// Recipient identifies who receives the notification
type Recipient struct {
	UserID      int64
	ProviderKey string // Pushover user key, webhook URL, etc.
}

// Payload contains notification content
type Payload struct {
	Title            string
	Message          string
	Sender           string
	Channel          string
	ChannelID        int64
	URL              string
	Timestamp        string
	NotificationType string
	ThreadContext    string
}
```

**Step 2: Verify it compiles**

Run:
```bash
go build ./internal/notifications/
```

Expected: No errors

**Step 3: Commit**

```bash
git add internal/notifications/provider.go
git commit -m "feat: define notification provider interface

Establishes Provider interface with Send and ValidateConfig methods.
Defines Recipient and Payload types for notification delivery."
```

---

## Task 3: Webhook Provider Implementation

**Files:**
- Create: `internal/notifications/webhook.go`
- Create: `internal/notifications/webhook_test.go`

**Step 1: Write failing test**

```go
// internal/notifications/webhook_test.go
package notifications

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebhookProvider_Send(t *testing.T) {
	// Create test server
	received := false
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected JSON content type")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	provider := NewWebhookProvider()
	recipient := Recipient{
		UserID:      1,
		ProviderKey: ts.URL,
	}
	payload := Payload{
		Title:   "Test Notification",
		Message: "Test message",
		URL:     "https://example.com",
	}

	err := provider.Send(context.Background(), recipient, payload)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if !received {
		t.Error("webhook was not called")
	}
}

func TestWebhookProvider_ValidateConfig(t *testing.T) {
	provider := NewWebhookProvider()
	err := provider.ValidateConfig()
	if err != nil {
		t.Errorf("webhook should always be valid: %v", err)
	}
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
go test ./internal/notifications/ -v -run TestWebhookProvider
```

Expected: FAIL with "undefined: NewWebhookProvider"

**Step 3: Implement webhook provider**

```go
// internal/notifications/webhook.go
package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// WebhookProvider sends notifications via HTTP POST to custom webhooks
type WebhookProvider struct {
	httpClient *http.Client
}

// NewWebhookProvider creates a new webhook provider
func NewWebhookProvider() *WebhookProvider {
	return &WebhookProvider{
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send delivers notification to webhook URL
func (w *WebhookProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
	webhookURL := recipient.ProviderKey
	if webhookURL == "" {
		return fmt.Errorf("webhook URL not configured")
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// ValidateConfig checks if provider is properly configured
func (w *WebhookProvider) ValidateConfig() error {
	return nil // No server-wide config needed for webhooks
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
go test ./internal/notifications/ -v -run TestWebhookProvider
```

Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/webhook.go internal/notifications/webhook_test.go
git commit -m "feat: implement webhook notification provider

Sends notifications via HTTP POST to custom webhook URLs.
Includes comprehensive tests for send and validation."
```

---

## Task 4: Pushover Provider Implementation

**Files:**
- Create: `internal/notifications/pushover.go`
- Create: `internal/notifications/pushover_test.go`

**Step 1: Write failing test**

```go
// internal/notifications/pushover_test.go
package notifications

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPushoverProvider_Send(t *testing.T) {
	tests := []struct {
		name        string
		appToken    string
		userKey     string
		expectError bool
	}{
		{
			name:        "valid send",
			appToken:    "test-app-token",
			userKey:     "test-user-key",
			expectError: false,
		},
		{
			name:        "missing app token",
			appToken:    "",
			userKey:     "test-user-key",
			expectError: true,
		},
		{
			name:        "missing user key",
			appToken:    "test-app-token",
			userKey:     "",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Mock Pushover API
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/1/messages.json" {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				w.WriteHeader(http.StatusOK)
			}))
			defer ts.Close()

			provider := NewPushoverProvider(tt.appToken)
			// Override API URL for testing
			provider.apiURL = ts.URL + "/1/messages.json"

			recipient := Recipient{
				UserID:      1,
				ProviderKey: tt.userKey,
			}
			payload := Payload{
				Title:   "Test",
				Message: "Test message",
				URL:     "https://example.com",
			}

			err := provider.Send(context.Background(), recipient, payload)
			if (err != nil) != tt.expectError {
				t.Errorf("expected error: %v, got: %v", tt.expectError, err)
			}
		})
	}
}

func TestPushoverProvider_ValidateConfig(t *testing.T) {
	tests := []struct {
		name        string
		appToken    string
		expectError bool
	}{
		{"valid token", "test-token", false},
		{"empty token", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := NewPushoverProvider(tt.appToken)
			err := provider.ValidateConfig()
			if (err != nil) != tt.expectError {
				t.Errorf("expected error: %v, got: %v", tt.expectError, err)
			}
		})
	}
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
go test ./internal/notifications/ -v -run TestPushoverProvider
```

Expected: FAIL with "undefined: NewPushoverProvider"

**Step 3: Implement Pushover provider**

```go
// internal/notifications/pushover.go
package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// PushoverProvider sends notifications via Pushover API
type PushoverProvider struct {
	appToken   string
	httpClient *http.Client
	apiURL     string // Exposed for testing
}

// NewPushoverProvider creates a new Pushover provider
func NewPushoverProvider(appToken string) *PushoverProvider {
	return &PushoverProvider{
		appToken:   appToken,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		apiURL:     "https://api.pushover.net/1/messages.json",
	}
}

// Send delivers notification via Pushover API
func (p *PushoverProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
	if p.appToken == "" {
		return fmt.Errorf("pushover app token not configured")
	}

	if recipient.ProviderKey == "" {
		return fmt.Errorf("pushover user key not configured")
	}

	body := map[string]string{
		"token":   p.appToken,
		"user":    recipient.ProviderKey,
		"title":   payload.Title,
		"message": payload.Message,
		"url":     payload.URL,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.apiURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("pushover request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("pushover returned status %d", resp.StatusCode)
	}

	return nil
}

// ValidateConfig checks if provider is properly configured
func (p *PushoverProvider) ValidateConfig() error {
	if p.appToken == "" {
		return fmt.Errorf("app token required")
	}
	return nil
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
go test ./internal/notifications/ -v -run TestPushoverProvider
```

Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/pushover.go internal/notifications/pushover_test.go
git commit -m "feat: implement Pushover notification provider

Sends notifications via Pushover API using server-wide app token
and per-user user keys. Includes comprehensive tests."
```

---

## Task 5: Refactor Notification Service for Provider Registry

**Files:**
- Modify: `internal/notifications/notifications.go`
- Create: `internal/notifications/service_test.go`

**Step 1: Write failing test for provider registry**

```go
// internal/notifications/service_test.go
package notifications

import (
	"context"
	"testing"
)

// MockProvider for testing
type MockProvider struct {
	sent          bool
	validateError error
}

func (m *MockProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
	m.sent = true
	return nil
}

func (m *MockProvider) ValidateConfig() error {
	return m.validateError
}

func TestService_RegisterProvider(t *testing.T) {
	svc := &Service{
		providers: make(map[string]Provider),
	}

	mock := &MockProvider{}
	svc.RegisterProvider("test", mock)

	if svc.providers["test"] == nil {
		t.Error("provider not registered")
	}
}

func TestService_GetAvailableProviders(t *testing.T) {
	svc := &Service{
		providers: make(map[string]Provider),
	}

	// No providers registered
	if len(svc.GetAvailableProviders()) != 0 {
		t.Error("expected no providers")
	}

	// Register valid provider
	validMock := &MockProvider{validateError: nil}
	svc.RegisterProvider("valid", validMock)

	available := svc.GetAvailableProviders()
	if len(available) != 1 || available[0] != "valid" {
		t.Errorf("expected ['valid'], got %v", available)
	}

	// Register invalid provider
	invalidMock := &MockProvider{validateError: fmt.Errorf("not configured")}
	svc.RegisterProvider("invalid", invalidMock)

	available = svc.GetAvailableProviders()
	if len(available) != 1 || available[0] != "valid" {
		t.Errorf("invalid provider should not appear, got %v", available)
	}
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
go test ./internal/notifications/ -v -run TestService_
```

Expected: FAIL (methods don't exist yet)

**Step 3: Add provider registry to Service struct**

Find the `Service` struct in `internal/notifications/notifications.go` and add:

```go
type Service struct {
	db        *db.DB
	providers map[string]Provider
}

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
```

**Step 4: Run test to verify it passes**

Run:
```bash
go test ./internal/notifications/ -v -run TestService_
```

Expected: PASS

**Step 5: Commit**

```bash
git add internal/notifications/notifications.go internal/notifications/service_test.go
git commit -m "feat: add provider registry to notification service

Service now manages map of providers, registers them by name,
and returns list of available (validated) providers."
```

---

## Task 6: Add App Settings Management to Notification Service

**Files:**
- Modify: `internal/notifications/notifications.go`

**Step 1: Add app settings methods**

Add to `internal/notifications/notifications.go`:

```go
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
```

**Step 2: Test manually by building**

Run:
```bash
go build ./internal/notifications/
```

Expected: No errors

**Step 3: Commit**

```bash
git add internal/notifications/notifications.go
git commit -m "feat: add app settings management methods

GetAppSettings, UpdateAppSettings, and GetAppSetting provide
CRUD operations for server-wide configuration like Pushover tokens."
```

---

## Task 7: Refactor Send Method to Use Providers

**Files:**
- Modify: `internal/notifications/notifications.go`

**Step 1: Update Settings struct**

Find the `Settings` struct and update it:

```go
type Settings struct {
	UserID               int64  `json:"userId"`
	Provider             string `json:"provider"`
	ProviderConfig       string `json:"providerConfig"` // JSON string
	BaseURL              string `json:"baseUrl"`
	NotifyMentions       bool   `json:"notifyMentions"`
	NotifyThreadReplies  bool   `json:"notifyThreadReplies"`
	NotifyAllMessages    bool   `json:"notifyAllMessages"`
}
```

**Step 2: Update GetSettings to use new schema**

```go
func (s *Service) GetSettings(userID int64) (*Settings, error) {
	var settings Settings
	err := s.db.QueryRow(`
		SELECT user_id, provider, provider_config, base_url,
		       notify_mentions, notify_thread_replies, notify_all_messages
		FROM user_notification_settings
		WHERE user_id = ?
	`, userID).Scan(
		&settings.UserID,
		&settings.Provider,
		&settings.ProviderConfig,
		&settings.BaseURL,
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
```

**Step 3: Update UpdateSettings to use new schema**

```go
func (s *Service) UpdateSettings(userID int64, settings *Settings) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO user_notification_settings
		(user_id, provider, provider_config, base_url, notify_mentions, notify_thread_replies, notify_all_messages, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, settings.Provider, settings.ProviderConfig, settings.BaseURL,
		settings.NotifyMentions, settings.NotifyThreadReplies, settings.NotifyAllMessages, now, now)
	return err
}
```

**Step 4: Refactor Send to use provider registry**

Update the `Send` method:

```go
func (s *Service) Send(msg *messages.Message, channelName string) error {
	// Get recipients (all users in channel except message author)
	rows, err := s.db.Query(`
		SELECT DISTINCT u.id
		FROM users u
		JOIN channel_members cm ON u.id = cm.user_id
		WHERE cm.channel_id = ? AND u.id != ?
	`, msg.ChannelID, msg.UserID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var recipientIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		recipientIDs = append(recipientIDs, id)
	}

	// Send to each recipient
	for _, recipientID := range recipientIDs {
		go s.sendToUser(recipientID, msg, channelName)
	}

	return nil
}

func (s *Service) sendToUser(userID int64, msg *messages.Message, channelName string) {
	// Get user's notification settings
	settings, err := s.GetSettings(userID)
	if err != nil || settings == nil {
		return // User has no settings, skip silently
	}

	// Check notification rules
	if !s.shouldNotify(userID, msg, settings) {
		return
	}

	// Get the provider
	provider, ok := s.providers[settings.Provider]
	if !ok {
		log.Printf("Unknown provider: %s", settings.Provider)
		return
	}

	// Build payload
	payload := s.buildPayload(msg, channelName, settings.BaseURL)

	// Parse provider config
	var providerConfig map[string]string
	json.Unmarshal([]byte(settings.ProviderConfig), &providerConfig)

	recipient := Recipient{
		UserID:      userID,
		ProviderKey: providerConfig["key"],
	}

	// Send with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := provider.Send(ctx, recipient, payload); err != nil {
		log.Printf("Notification send error (user %d, provider %s): %v", userID, settings.Provider, err)
	}
}
```

**Step 5: Keep existing helper methods (shouldNotify, buildPayload)**

These methods remain largely unchanged but reference the new Settings struct.

**Step 6: Test by building**

Run:
```bash
go build ./internal/notifications/
```

Expected: No errors (may have import errors to fix)

**Step 7: Commit**

```bash
git add internal/notifications/notifications.go
git commit -m "refactor: update notification service to use providers

Send method now routes through provider registry. Settings struct
updated for provider + provider_config fields. Maintains backward
compatibility with notification rules."
```

---

## Task 8: Add API Endpoints for Providers and Admin Settings

**Files:**
- Modify: `internal/api/api.go`

**Step 1: Add GET /api/notifications/providers endpoint**

Add to the handler in `internal/api/api.go`:

```go
// In the ServeHTTP method, add:
case r.Method == "GET" && strings.HasPrefix(path, "/api/notifications/providers"):
	h.handleGetProviders(w, r)
	return
```

Then add the handler:

```go
func (h *Handler) handleGetProviders(w http.ResponseWriter, r *http.Request) {
	providers := h.notifySvc.GetAvailableProviders()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": providers,
	})
}
```

**Step 2: Add GET /api/admin/settings endpoint**

```go
// In ServeHTTP:
case r.Method == "GET" && strings.HasPrefix(path, "/api/admin/settings"):
	h.handleGetAdminSettings(w, r)
	return
```

Handler:

```go
func (h *Handler) handleGetAdminSettings(w http.ResponseWriter, r *http.Request) {
	user := h.mustGetUser(r)
	if user.Role != "admin" {
		http.Error(w, "admin only", http.StatusForbidden)
		return
	}

	settings, err := h.notifySvc.GetAppSettings()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(settings)
}
```

**Step 3: Add POST /api/admin/settings endpoint**

```go
// In ServeHTTP:
case r.Method == "POST" && strings.HasPrefix(path, "/api/admin/settings"):
	h.handleUpdateAdminSettings(w, r)
	return
```

Handler:

```go
func (h *Handler) handleUpdateAdminSettings(w http.ResponseWriter, r *http.Request) {
	user := h.mustGetUser(r)
	if user.Role != "admin" {
		http.Error(w, "admin only", http.StatusForbidden)
		return
	}

	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.notifySvc.UpdateAppSettings(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// NOTE: Provider reload would require server restart or more complex mechanism
	// For now, admin must restart server after changing Pushover token

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
```

**Step 4: Test by building**

Run:
```bash
go build ./cmd/app/
```

Expected: No errors

**Step 5: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add API endpoints for providers and admin settings

GET /api/notifications/providers - list available providers
GET /api/admin/settings - get server-wide settings (admin)
POST /api/admin/settings - update server settings (admin)"
```

---

## Task 9: Register Providers at Startup

**Files:**
- Modify: `cmd/app/main.go`

**Step 1: Add provider registration after service creation**

Find where `notifySvc` is created and add:

```go
notifySvc := notifications.NewService(database)

// Register webhook provider (always available)
notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

// Register Pushover provider if configured
pushoverToken, err := notifySvc.GetAppSetting("pushover_app_token")
if err == nil && pushoverToken != "" {
	notifySvc.RegisterProvider("pushover", notifications.NewPushoverProvider(pushoverToken))
	log.Printf("Pushover provider enabled")
}
```

**Step 2: Test by running**

Run:
```bash
DATA_DIR=./tmp go run ./cmd/app/
```

Expected: Server starts, logs show "Pushover provider enabled" if token configured

**Step 3: Commit**

```bash
git add cmd/app/main.go
git commit -m "feat: register notification providers at startup

Webhook provider always registered. Pushover provider registered
if app_settings contains non-empty pushover_app_token."
```

---

## Task 10: Frontend - Update User Notification Settings UI

**Files:**
- Modify: `frontend/src/app.js`

**Step 1: Update renderNotificationSettings function**

Find and replace the notification settings rendering:

```javascript
async function renderNotificationSettings() {
    // Fetch available providers
    const providersResp = await fetch('/api/notifications/providers');
    const { providers } = await providersResp.json();

    // Fetch current settings
    const settingsResp = await fetch('/api/notifications/settings');
    const settings = await settingsResp.json();

    let providerFields = '';

    if (providers.includes('pushover')) {
        const selected = settings?.provider === 'pushover' ? 'checked' : '';
        const userKey = settings?.providerConfig ? JSON.parse(settings.providerConfig).key || '' : '';
        providerFields += `
            <label>
                <input type="radio" name="provider" value="pushover" ${selected}>
                Pushover (simplified setup)
            </label>
            <div id="pushover-config" class="provider-config" style="display: ${selected ? 'block' : 'none'}">
                <label>
                    Pushover User Key:
                    <input type="text" id="pushover-user-key"
                           placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                           value="${userKey}">
                </label>
                <small>Get your user key from <a href="https://pushover.net" target="_blank">pushover.net</a></small>
            </div>
        `;
    }

    if (providers.includes('webhook')) {
        const selected = settings?.provider === 'webhook' ? 'checked' : '';
        const url = settings?.providerConfig ? JSON.parse(settings.providerConfig).key || '' : '';
        providerFields += `
            <label>
                <input type="radio" name="provider" value="webhook" ${selected}>
                Custom Webhook
            </label>
            <div id="webhook-config" class="provider-config" style="display: ${selected ? 'block' : 'none'}">
                <label>
                    Webhook URL:
                    <input type="text" id="webhook-url"
                           placeholder="https://..."
                           value="${url}">
                </label>
            </div>
        `;
    }

    return `
        <div class="settings-section">
            <h3>Notification Method</h3>
            ${providerFields}
        </div>
        <div class="settings-section">
            <label>Base URL: <input type="text" id="base-url" value="${settings?.baseUrl || ''}"></label>
            <label><input type="checkbox" id="notify-mentions" ${settings?.notifyMentions ? 'checked' : ''}> @Mentions</label>
            <label><input type="checkbox" id="notify-replies" ${settings?.notifyThreadReplies ? 'checked' : ''}> Thread Replies</label>
            <label><input type="checkbox" id="notify-all" ${settings?.notifyAllMessages ? 'checked' : ''}> All Messages</label>
        </div>
        <button id="save-notification-settings">Save</button>
    `;
}
```

**Step 2: Add radio button toggle handler**

```javascript
// After rendering, add event listeners
document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.provider-config').forEach(div => {
            div.style.display = 'none';
        });
        const selectedProvider = e.target.value;
        const configDiv = document.getElementById(`${selectedProvider}-config`);
        if (configDiv) {
            configDiv.style.display = 'block';
        }
    });
});
```

**Step 3: Update save handler**

```javascript
document.getElementById('save-notification-settings').addEventListener('click', async () => {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || 'webhook';

    let providerConfig = {};
    if (provider === 'pushover') {
        providerConfig.key = document.getElementById('pushover-user-key').value;
    } else if (provider === 'webhook') {
        providerConfig.key = document.getElementById('webhook-url').value;
    }

    const settings = {
        provider: provider,
        providerConfig: JSON.stringify(providerConfig),
        baseUrl: document.getElementById('base-url').value,
        notifyMentions: document.getElementById('notify-mentions').checked,
        notifyThreadReplies: document.getElementById('notify-replies').checked,
        notifyAllMessages: document.getElementById('notify-all').checked,
    };

    const resp = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });

    if (resp.ok) {
        alert('Settings saved!');
    } else {
        alert('Failed to save settings');
    }
});
```

**Step 4: Build frontend**

Run:
```bash
cd frontend && bun run build && cd ..
```

Expected: Build succeeds

**Step 5: Copy to static**

Run:
```bash
cp frontend/dist/* cmd/app/static/
```

**Step 6: Commit**

```bash
git add frontend/src/app.js cmd/app/static/
git commit -m "feat: update user notification settings UI for providers

Radio buttons for provider selection. Provider-specific config
fields toggle based on selection. Saves provider + config JSON."
```

---

## Task 11: Frontend - Add Admin Settings UI

**Files:**
- Modify: `frontend/src/app.js`

**Step 1: Add admin settings render function**

```javascript
async function renderAdminSettings() {
    const resp = await fetch('/api/admin/settings');
    if (!resp.ok) {
        return '<p>Admin access required</p>';
    }

    const settings = await resp.json();

    return `
        <div class="admin-settings">
            <h2>Server Notification Settings</h2>
            <form id="admin-settings-form">
                <label>
                    Pushover App Token:
                    <input type="text" name="pushover_app_token"
                           placeholder="Leave empty to disable Pushover"
                           value="${settings.pushover_app_token || ''}">
                </label>
                <small>Get from <a href="https://pushover.net/apps/build" target="_blank">pushover.net/apps/build</a></small>
                <br>
                <small><strong>Note:</strong> Server must be restarted after changing this setting.</small>
                <br>
                <button type="submit">Save</button>
            </form>
        </div>
    `;
}
```

**Step 2: Add admin settings save handler**

```javascript
// After rendering admin settings
document.getElementById('admin-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const settings = {
        pushover_app_token: formData.get('pushover_app_token'),
    };

    const resp = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });

    if (resp.ok) {
        alert('Settings saved! Restart server to apply changes.');
    } else {
        alert('Failed to save settings');
    }
});
```

**Step 3: Add admin settings to admin panel navigation**

Find where admin panel routes are defined and add:

```javascript
// In admin panel view
if (route === 'admin/settings') {
    content = await renderAdminSettings();
}
```

**Step 4: Build frontend**

Run:
```bash
cd frontend && bun run build && cd ..
```

Expected: Build succeeds

**Step 5: Copy to static**

Run:
```bash
cp frontend/dist/* cmd/app/static/
```

**Step 6: Commit**

```bash
git add frontend/src/app.js cmd/app/static/
git commit -m "feat: add admin settings UI for Pushover configuration

Admin can configure server-wide Pushover app token. UI warns that
server restart is required for changes to take effect."
```

---

## Task 12: Integration Testing

**Files:**
- Test existing functionality

**Step 1: Start fresh server**

Run:
```bash
rm -rf tmp/
mkdir -p tmp
DATA_DIR=./tmp go run ./cmd/app/
```

Expected: Server starts on :8080

**Step 2: Bootstrap admin account**

Open browser to http://localhost:8080, create admin account

Expected: Account created successfully

**Step 3: Test admin settings (without Pushover token)**

Navigate to admin settings, verify Pushover token field shows empty

Expected: Admin settings page loads

**Step 4: Test user notification settings (no Pushover)**

Go to user settings, verify only "Custom Webhook" option appears

Expected: Only webhook provider shown

**Step 5: Add Pushover token via admin**

Enter test token (any string), save

Expected: Settings saved message

**Step 6: Restart server and verify Pushover enabled**

Stop server (Ctrl+C), restart with `DATA_DIR=./tmp go run ./cmd/app/`

Expected: Log shows "Pushover provider enabled"

**Step 7: Test user settings (with Pushover)**

Go to user settings, verify both Pushover and Webhook options appear

Expected: Both providers shown

**Step 8: Configure Pushover user key**

Select Pushover, enter user key, save

Expected: Settings saved

**Step 9: Commit**

```bash
git add -A
git commit -m "test: verify Pushover integration end-to-end

Manual testing confirms:
- Admin can configure Pushover token
- Provider availability reflects configuration
- Users can select and configure providers
- Settings persist correctly"
```

---

## Task 13: Update Documentation

**Files:**
- Modify: `README.md`

**Step 1: Update notification setup section**

Find the Notifications section and update the Pushover setup instructions:

```markdown
### Notifications

Get mobile push notifications when:
- Someone @mentions you
- Someone replies to a thread you're in
- All messages (optional)

**Setup (Admin):**

For simplified Pushover setup:
1. Create a Pushover application at https://pushover.net/apps/build
2. In Relay Chat admin settings, enter your Pushover app token
3. Restart the server

**Setup (Users):**

If Pushover is enabled:
- Go to Settings → Notifications
- Select "Pushover"
- Enter your Pushover user key from https://pushover.net
- Configure notification preferences
- Save

For custom webhooks:
- Go to Settings → Notifications
- Select "Custom Webhook"
- Enter your webhook URL (e.g., ntfy.sh, custom endpoint)
- Configure notification preferences
- Save
```

**Step 2: Update API endpoints table**

Add new endpoints:

```markdown
| GET | `/api/notifications/providers` | yes | List available notification providers |
| GET | `/api/admin/settings` | admin | Get server-wide settings |
| POST | `/api/admin/settings` | admin | Update server-wide settings |
```

**Step 3: Build and commit**

Run:
```bash
git add README.md
git commit -m "docs: update README with Pushover integration details

Documents admin setup for Pushover, user configuration options,
and new API endpoints for provider management."
```

---

## Execution Options

Plan complete and saved to `docs/plans/2026-02-17-pushover-integration-plan.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
