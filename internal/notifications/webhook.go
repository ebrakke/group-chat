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
