// internal/notifications/service_test.go
package notifications

import (
	"context"
	"fmt"
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
