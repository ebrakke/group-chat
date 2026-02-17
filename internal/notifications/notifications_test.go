package notifications

import (
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func TestNewService(t *testing.T) {
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	svc := NewService(database)
	if svc == nil {
		t.Fatal("NewService returned nil")
	}
	if svc.db == nil {
		t.Fatal("service db is nil")
	}
}

func TestGetSettings_NotFound(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	_, err := svc.GetSettings(999)
	if err == nil {
		t.Fatal("expected error for non-existent settings")
	}
}

func TestUpdateSettings(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Create a test user first
	_, err := database.Exec("INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
		"testuser", "Test User", "hash", "member")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	settings := &Settings{
		UserID:              1,
		WebhookURL:          "https://example.com/webhook",
		BaseURL:             "https://chat.example.com",
		NotifyMentions:      true,
		NotifyThreadReplies: true,
		NotifyAllMessages:   false,
	}

	err = svc.UpdateSettings(1, settings)
	if err != nil {
		t.Fatalf("UpdateSettings failed: %v", err)
	}

	// Verify
	got, err := svc.GetSettings(1)
	if err != nil {
		t.Fatalf("GetSettings failed: %v", err)
	}
	if got.WebhookURL != settings.WebhookURL {
		t.Errorf("webhook_url = %q, want %q", got.WebhookURL, settings.WebhookURL)
	}
}
