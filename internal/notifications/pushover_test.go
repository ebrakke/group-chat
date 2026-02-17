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
