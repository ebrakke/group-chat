// internal/notifications/service_test.go
package notifications

import (
	"context"
	"fmt"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
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

func TestService_PushSubscriptions(t *testing.T) {
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	svc := NewService(database, "http://localhost:8080")

	// Create test user
	_, err = database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 1, "alice", "Alice", "hash", "member")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// No subscriptions initially
	topics, err := svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 0 {
		t.Errorf("expected 0 topics, got %d", len(topics))
	}

	// Subscribe
	err = svc.SubscribePush(1, "topic-abc123", "android")
	if err != nil {
		t.Fatalf("SubscribePush failed: %v", err)
	}

	// Verify subscription
	topics, err = svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 1 || topics[0] != "topic-abc123" {
		t.Errorf("expected ['topic-abc123'], got %v", topics)
	}

	// Unsubscribe
	err = svc.UnsubscribePush("topic-abc123")
	if err != nil {
		t.Fatalf("UnsubscribePush failed: %v", err)
	}

	// Verify removed
	topics, err = svc.GetPushTopics(1)
	if err != nil {
		t.Fatalf("GetPushTopics failed: %v", err)
	}
	if len(topics) != 0 {
		t.Errorf("expected 0 topics after unsubscribe, got %d", len(topics))
	}
}
