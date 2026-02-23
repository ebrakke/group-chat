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
