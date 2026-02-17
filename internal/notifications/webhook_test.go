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
