# Pushover Integration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan from this design.

**Goal:** Add built-in Pushover support with server-wide app token configuration, allowing users to simply enter their Pushover user key for simplified notification setup.

**Architecture:** Plugin-style notification provider system where Pushover and webhook providers implement a common interface. Admin configures Pushover app token server-wide; users choose between Pushover (simple user key) or webhook (full URL). Providers registered at startup based on configuration.

**Tech Stack:** Go backend, SQLite database, vanilla JavaScript frontend with Bun

---

## 1. Architecture Overview

### Provider Interface

Core abstraction that all notification providers implement:

```go
// internal/notifications/provider.go
type Provider interface {
    // Send delivers a notification for a message
    Send(ctx context.Context, recipient Recipient, payload Payload) error

    // ValidateConfig checks if provider is properly configured
    ValidateConfig() error
}

type Recipient struct {
    UserID      int64
    ProviderKey string  // Pushover user key, webhook URL, etc.
}

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

### Provider Registry

The notification service manages a registry of available providers. At runtime:
- Checks which providers are configured (validates via `ValidateConfig()`)
- Routes notifications to user's chosen provider
- Frontend queries available providers via API

### Benefits

- Clean separation between notification logic and delivery mechanism
- Easy to add new providers (Discord, Slack, email) without touching existing code
- Testable: mock providers for unit tests
- Each provider handles its own quirks (rate limits, retries, error handling)

---

## 2. Database Schema

Since we have zero users, we can redesign cleanly:

```sql
-- Migration: 008_provider_based_notifications.sql

-- Drop old webhook-specific table
DROP TABLE IF EXISTS user_notification_settings;

-- New provider-agnostic settings table
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'webhook',  -- 'pushover' or 'webhook'
    provider_config TEXT NOT NULL,             -- JSON: {"user_key": "..."} or {"url": "..."}
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

-- thread_mutes table stays unchanged
```

**Design rationale:**
- `provider`: Determines which notification provider to use
- `provider_config`: JSON blob for provider-specific settings (flexible for future providers)
- `app_settings`: Key-value store for server-wide config (Pushover app token, future settings)
- Clean slate approach since zero users exist

---

## 3. Provider Implementations

### Pushover Provider

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

type PushoverProvider struct {
    appToken   string
    httpClient *http.Client
}

func NewPushoverProvider(appToken string) *PushoverProvider {
    return &PushoverProvider{
        appToken: appToken,
        httpClient: &http.Client{Timeout: 10 * time.Second},
    }
}

func (p *PushoverProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
    if p.appToken == "" {
        return fmt.Errorf("pushover app token not configured")
    }

    body := map[string]string{
        "token":   p.appToken,
        "user":    recipient.ProviderKey, // User's Pushover user key
        "title":   payload.Title,
        "message": payload.Message,
        "url":     payload.URL,
    }

    jsonBody, _ := json.Marshal(body)
    req, _ := http.NewRequestWithContext(ctx, "POST",
        "https://api.pushover.net/1/messages.json",
        bytes.NewBuffer(jsonBody))
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

func (p *PushoverProvider) ValidateConfig() error {
    if p.appToken == "" {
        return fmt.Errorf("app token required")
    }
    return nil
}
```

### Webhook Provider

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

type WebhookProvider struct {
    httpClient *http.Client
}

func NewWebhookProvider() *WebhookProvider {
    return &WebhookProvider{
        httpClient: &http.Client{Timeout: 10 * time.Second},
    }
}

func (w *WebhookProvider) Send(ctx context.Context, recipient Recipient, payload Payload) error {
    webhookURL := recipient.ProviderKey
    if webhookURL == "" {
        return fmt.Errorf("webhook URL not configured")
    }

    jsonPayload, _ := json.Marshal(payload)
    req, _ := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(jsonPayload))
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

func (w *WebhookProvider) ValidateConfig() error {
    return nil // No server-wide config needed for webhooks
}
```

**Key points:**
- Each provider handles its own HTTP client, retries, error handling
- Pushover provider requires server-wide app token
- Webhook provider needs no server-wide config (user provides full URL)
- Both implement the same `Provider` interface
- Context support for timeouts and cancellation

---

## 4. Notification Service Refactor

The notification service becomes a provider orchestrator:

```go
// internal/notifications/notifications.go (refactored)
package notifications

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/ebrakke/relay-chat/internal/db"
    "github.com/ebrakke/relay-chat/internal/messages"
)

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

// Send dispatches notification via user's configured provider
func (s *Service) Send(msg *messages.Message, channelName string) error {
    // Get user's notification settings
    settings, err := s.GetSettings(msg.UserID)
    if err != nil || settings == nil {
        return nil // User has no settings, skip silently
    }

    // Check notification rules (existing logic)
    if !s.shouldNotify(msg, settings) {
        return nil
    }

    // Get the provider
    provider, ok := s.providers[settings.Provider]
    if !ok {
        return fmt.Errorf("unknown provider: %s", settings.Provider)
    }

    // Build payload
    payload := s.buildPayload(msg, channelName, settings.BaseURL)

    // Parse provider config
    var providerConfig map[string]string
    json.Unmarshal([]byte(settings.ProviderConfig), &providerConfig)

    recipient := Recipient{
        UserID:      msg.UserID,
        ProviderKey: providerConfig["key"], // "user_key" for Pushover, "url" for webhook
    }

    // Send asynchronously
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    go func() {
        if err := provider.Send(ctx, recipient, payload); err != nil {
            // Log but don't fail the message send
            fmt.Printf("Notification send error: %v\n", err)
        }
    }()

    return nil
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

### Initialization in main.go

```go
notifySvc := notifications.NewService(database)

// Register webhook provider (always available)
notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

// Register Pushover provider if configured
pushoverToken := getAppSetting(database, "pushover_app_token")
if pushoverToken != "" {
    notifySvc.RegisterProvider("pushover", notifications.NewPushoverProvider(pushoverToken))
}
```

**Key design points:**
- Provider registry pattern (extensible)
- Providers validate their own configuration
- Frontend can call `GET /api/notifications/providers` to see what's available
- Graceful degradation if provider misconfigured
- Async sending preserved (non-blocking)

---

## 5. API Changes

### New Endpoints

```
GET  /api/notifications/providers        - List available providers
GET  /api/admin/settings                 - Get admin settings (admin only)
POST /api/admin/settings                 - Update admin settings (admin only)
```

### Modified Endpoint

```
POST /api/notifications/settings
Body: {
  "provider": "pushover",              // or "webhook"
  "provider_config": {
    "user_key": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG"  // for Pushover
    // OR
    "url": "https://..."                          // for webhook
  },
  "base_url": "https://chat.example.com",
  "notify_mentions": true,
  "notify_thread_replies": true,
  "notify_all_messages": false
}
```

### Handler Additions

```go
// GET /api/notifications/providers
func (h *Handler) handleGetProviders(w http.ResponseWriter, r *http.Request) {
    providers := h.notifySvc.GetAvailableProviders()
    json.NewEncoder(w).Encode(map[string]interface{}{
        "providers": providers,
    })
}

// GET /api/admin/settings
func (h *Handler) handleGetAdminSettings(w http.ResponseWriter, r *http.Request) {
    user := mustGetUser(r)
    if user.Role != "admin" {
        http.Error(w, "admin only", http.StatusForbidden)
        return
    }

    settings, _ := h.notifySvc.GetAppSettings()
    json.NewEncoder(w).Encode(settings)
}

// POST /api/admin/settings
func (h *Handler) handleUpdateAdminSettings(w http.ResponseWriter, r *http.Request) {
    user := mustGetUser(r)
    if user.Role != "admin" {
        http.Error(w, "admin only", http.StatusForbidden)
        return
    }

    var req map[string]string
    json.NewDecoder(r.Body).Decode(&req)

    if err := h.notifySvc.UpdateAppSettings(req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Re-register providers after settings change
    h.reloadNotificationProviders()

    w.WriteHeader(http.StatusOK)
}
```

**Key API design:**
- Frontend calls `/api/notifications/providers` to know what to show
- Admin settings protected by role check
- Changing admin settings triggers provider reload
- User settings remain flexible with JSON provider config

---

## 6. Frontend UI Changes

### User Settings Modal (Modified)

```javascript
// frontend/src/app.js - renderNotificationSettings()

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
        providerFields += `
            <label>
                <input type="radio" name="provider" value="pushover" ${selected}>
                Pushover (simplified setup)
            </label>
            <div id="pushover-config" style="display: ${selected ? 'block' : 'none'}">
                <label>
                    Pushover User Key:
                    <input type="text" id="pushover-user-key"
                           placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                           value="${settings?.provider_config?.user_key || ''}">
                </label>
            </div>
        `;
    }

    if (providers.includes('webhook')) {
        const selected = settings?.provider === 'webhook' ? 'checked' : '';
        providerFields += `
            <label>
                <input type="radio" name="provider" value="webhook" ${selected}>
                Custom Webhook
            </label>
            <div id="webhook-config" style="display: ${selected ? 'block' : 'none'}">
                <label>
                    Webhook URL:
                    <input type="text" id="webhook-url"
                           placeholder="https://..."
                           value="${settings?.provider_config?.url || ''}">
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
            <label>Base URL: <input type="text" id="base-url" value="${settings?.base_url || ''}"></label>
            <label><input type="checkbox" id="notify-mentions" ${settings?.notify_mentions ? 'checked' : ''}> @Mentions</label>
            <label><input type="checkbox" id="notify-replies" ${settings?.notify_thread_replies ? 'checked' : ''}> Thread Replies</label>
            <label><input type="checkbox" id="notify-all" ${settings?.notify_all_messages ? 'checked' : ''}> All Messages</label>
        </div>
    `;
}
```

### Admin Settings Page (New)

```javascript
// Add to admin panel in frontend/src/app.js

async function renderAdminSettings() {
    const resp = await fetch('/api/admin/settings');
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
                    <small>Get from <a href="https://pushover.net/apps/build" target="_blank">pushover.net/apps/build</a></small>
                </label>
                <button type="submit">Save</button>
            </form>
        </div>
    `;
}
```

**Key frontend features:**
- Radio buttons for provider selection (only show available ones)
- Provider-specific config fields toggle based on selection
- Admin settings protected (only shown to admins)
- Clear help text for Pushover setup
- Graceful fallback if no providers configured

---

## 7. Testing Strategy

### Unit Tests (Go)

```go
// internal/notifications/pushover_test.go
func TestPushoverProvider_Send(t *testing.T) {
    tests := []struct {
        name        string
        appToken    string
        recipient   Recipient
        expectError bool
    }{
        {
            name:     "valid send",
            appToken: "test-app-token",
            recipient: Recipient{
                UserID:      1,
                ProviderKey: "test-user-key",
            },
            expectError: false,
        },
        {
            name:        "missing app token",
            appToken:    "",
            expectError: true,
        },
        {
            name:     "missing user key",
            appToken: "test-app-token",
            recipient: Recipient{
                UserID:      1,
                ProviderKey: "",
            },
            expectError: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            provider := NewPushoverProvider(tt.appToken)
            payload := Payload{
                Title:   "Test",
                Message: "Test message",
                URL:     "https://example.com",
            }

            err := provider.Send(context.Background(), tt.recipient, payload)
            if (err != nil) != tt.expectError {
                t.Errorf("expected error: %v, got: %v", tt.expectError, err)
            }
        })
    }
}

// internal/notifications/service_test.go
func TestService_GetAvailableProviders(t *testing.T) {
    db := setupTestDB(t)
    svc := NewService(db)

    // Initially no providers
    assert.Empty(t, svc.GetAvailableProviders())

    // Register webhook (always available)
    svc.RegisterProvider("webhook", NewWebhookProvider())
    assert.Contains(t, svc.GetAvailableProviders(), "webhook")

    // Register unconfigured Pushover
    svc.RegisterProvider("pushover", NewPushoverProvider(""))
    assert.NotContains(t, svc.GetAvailableProviders(), "pushover")

    // Register configured Pushover
    svc.RegisterProvider("pushover", NewPushoverProvider("valid-token"))
    assert.Contains(t, svc.GetAvailableProviders(), "pushover")
}
```

### Integration Tests

```go
// internal/api/notifications_test.go
func TestNotificationProvidersEndpoint(t *testing.T) {
    // Setup test server
    db := setupTestDB(t)
    svc := notifications.NewService(db)
    svc.RegisterProvider("webhook", notifications.NewWebhookProvider())

    handler := setupTestHandler(t, svc)

    req := httptest.NewRequest("GET", "/api/notifications/providers", nil)
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)

    assert.Equal(t, 200, w.Code)

    var resp map[string][]string
    json.Unmarshal(w.Body.Bytes(), &resp)
    assert.Contains(t, resp["providers"], "webhook")
}

func TestAdminSettingsEndpoint(t *testing.T) {
    // Test admin can update settings
    // Test non-admin gets 403
    // Test provider reload after settings change
}
```

### Manual Testing Checklist

1. **Admin configures Pushover:**
   - Admin logs in, goes to admin settings
   - Enters Pushover app token, saves
   - Verify Pushover option appears for users

2. **User configures Pushover:**
   - User goes to settings, sees Pushover option
   - Enters user key, saves
   - Sends test message with @mention
   - Verify notification arrives on Pushover

3. **User configures webhook:**
   - User selects webhook option
   - Enters webhook URL, saves
   - Sends test message
   - Verify webhook receives JSON payload

4. **Provider switching:**
   - User switches from Pushover to webhook
   - Verify notifications use webhook
   - Switch back to Pushover
   - Verify notifications use Pushover

5. **Admin disables Pushover:**
   - Admin clears Pushover app token
   - Verify Pushover option hidden from users
   - Existing Pushover users see error in logs

### Error Scenarios

- Invalid Pushover user key
- Pushover API timeout
- Webhook endpoint returns 500
- Provider not configured
- Database connection loss during send

---

## 8. Implementation Summary

**Files to create:**
- `internal/notifications/provider.go` - Provider interface
- `internal/notifications/pushover.go` - Pushover provider
- `internal/notifications/webhook.go` - Webhook provider
- `internal/db/migrations/008_provider_based_notifications.sql` - Database migration

**Files to modify:**
- `internal/notifications/notifications.go` - Refactor to provider orchestrator
- `internal/api/api.go` - Add new endpoints
- `cmd/app/main.go` - Provider registration at startup
- `frontend/src/app.js` - User settings and admin settings UI

**Testing:**
- Unit tests for each provider
- Integration tests for API endpoints
- Manual testing checklist for UX validation

**Benefits:**
- Simplified user experience (Pushover user key vs full webhook URL)
- Extensible architecture (easy to add Discord, Slack, etc.)
- Clean separation of concerns
- No breaking changes needed (zero users)
