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
