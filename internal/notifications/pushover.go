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
