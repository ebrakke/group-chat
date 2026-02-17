package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
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

func TestThreadMuting(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Create user and channel
	if _, err := database.Exec("INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))", "user1", "User 1", "hash", "member"); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	if _, err := database.Exec("INSERT INTO channels (name, created_at) VALUES (?, datetime('now'))", "general"); err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}
	if _, err := database.Exec("INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))", 1, 1, "test message"); err != nil {
		t.Fatalf("failed to create message: %v", err)
	}

	// Initially not muted
	muted, err := svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if muted {
		t.Error("thread should not be muted initially")
	}

	// Mute thread
	err = svc.MuteThread(1, 1)
	if err != nil {
		t.Fatalf("MuteThread failed: %v", err)
	}

	// Verify muted
	muted, err = svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if !muted {
		t.Error("thread should be muted")
	}

	// Unmute thread
	err = svc.UnmuteThread(1, 1)
	if err != nil {
		t.Fatalf("UnmuteThread failed: %v", err)
	}

	// Verify unmuted
	muted, err = svc.IsThreadMuted(1, 1)
	if err != nil {
		t.Fatalf("IsThreadMuted failed: %v", err)
	}
	if muted {
		t.Error("thread should not be muted after unmute")
	}
}

func TestBuildPayload(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	msg := &messages.Message{
		ID:          123,
		ChannelID:   1,
		UserID:      2,
		Content:     "@alice check this out",
		DisplayName: "Bob",
		Username:    "bob",
	}

	settings := &Settings{
		BaseURL: "https://chat.example.com",
	}

	payload := svc.buildPayload(msg, "general", "", "mention", settings)

	if payload["message"] != "@alice check this out" {
		t.Errorf("message = %q, want %q", payload["message"], "@alice check this out")
	}
	if payload["sender"] != "Bob" {
		t.Errorf("sender = %q, want %q", payload["sender"], "Bob")
	}
	if payload["channel"] != "general" {
		t.Errorf("channel = %q, want %q", payload["channel"], "general")
	}
	if payload["notificationType"] != "mention" {
		t.Errorf("notificationType = %q, want %q", payload["notificationType"], "mention")
	}
	expectedURL := "https://chat.example.com/#/channel/1"
	if payload["url"] != expectedURL {
		t.Errorf("url = %q, want %q", payload["url"], expectedURL)
	}
}

func TestSendWebhook(t *testing.T) {
	database, _ := db.Open(":memory:")
	defer database.Close()
	svc := NewService(database)

	// Mock webhook server
	var receivedPayload map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("method = %s, want POST", r.Method)
		}
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	payload := map[string]interface{}{
		"title":   "Test",
		"message": "Test message",
	}

	err := svc.sendWebhook(server.URL, payload)
	if err != nil {
		t.Fatalf("sendWebhook failed: %v", err)
	}

	if receivedPayload["title"] != "Test" {
		t.Errorf("received title = %v, want Test", receivedPayload["title"])
	}
}
