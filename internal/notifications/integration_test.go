package notifications

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
)

func TestIntegration_NotificationFlow(t *testing.T) {
	// Setup database
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	// Create services
	notifySvc := NewService(database)
	msgSvc := messages.NewService(database)

	// Setup webhook mock
	var receivedNotifications []map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		json.NewDecoder(r.Body).Decode(&payload)
		receivedNotifications = append(receivedNotifications, payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create users
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 1, "alice", "Alice", "hash", "member")
	database.Exec("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", 2, "bob", "Bob", "hash", "member")

	// Create channel
	database.Exec("INSERT INTO channels (id, name, group_id, created_at) VALUES (?, ?, ?, datetime('now'))", 1, "general", "group1")
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 1)
	database.Exec("INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, datetime('now'))", 1, 2)

	// Configure Alice's notifications
	err = notifySvc.UpdateSettings(1, &Settings{
		UserID:              1,
		WebhookURL:          server.URL,
		BaseURL:             "https://chat.example.com",
		NotifyMentions:      true,
		NotifyThreadReplies: true,
	})
	if err != nil {
		t.Fatalf("failed to update settings: %v", err)
	}

	// Wire up message service with notification callback
	msgSvc.SetNotifyFunc(func(msg *messages.Message, channelName string) {
		notifySvc.Send(msg, channelName)
	})

	// Bob sends a message mentioning Alice
	msg, err := msgSvc.Create(1, 2, "Hey @alice, check this out!", "group1")
	if err != nil {
		t.Fatalf("Create message failed: %v", err)
	}

	// Wait for webhook
	time.Sleep(200 * time.Millisecond)

	// Verify webhook was called
	if len(receivedNotifications) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(receivedNotifications))
	}

	notification := receivedNotifications[0]
	if notification["notificationType"] != "mention" {
		t.Errorf("notificationType = %v, want mention", notification["notificationType"])
	}
	if notification["sender"] != "Bob" {
		t.Errorf("sender = %v, want Bob", notification["sender"])
	}

	// Alice replies to the message (creates a thread)
	reply, err := msgSvc.CreateReply(msg.ID, 1, "Thanks Bob!", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}
	_ = reply

	// Bob should NOT get notified (he's the thread author but Alice is replying)
	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 1 {
		t.Errorf("Bob should not be notified of Alice's reply to his own thread, got %d notifications", len(receivedNotifications))
	}

	// Bob replies to the thread - Alice should get notified
	_, err = msgSvc.CreateReply(msg.ID, 2, "No problem!", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(receivedNotifications))
	}

	notification = receivedNotifications[1]
	if notification["notificationType"] != "thread_reply" {
		t.Errorf("notificationType = %v, want thread_reply", notification["notificationType"])
	}

	// Alice mutes the thread
	err = notifySvc.MuteThread(1, msg.ID)
	if err != nil {
		t.Fatalf("MuteThread failed: %v", err)
	}

	// Bob replies again - Alice should NOT get notified
	_, err = msgSvc.CreateReply(msg.ID, 2, "Another reply", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 2 {
		t.Errorf("Alice should not be notified after muting, got %d notifications", len(receivedNotifications))
	}

	// Alice unmutes the thread
	err = notifySvc.UnmuteThread(1, msg.ID)
	if err != nil {
		t.Fatalf("UnmuteThread failed: %v", err)
	}

	// Bob replies again - Alice should get notified
	_, err = msgSvc.CreateReply(msg.ID, 2, "Yet another reply", "group1")
	if err != nil {
		t.Fatalf("CreateReply failed: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if len(receivedNotifications) != 3 {
		t.Fatalf("expected 3 notifications after unmute, got %d", len(receivedNotifications))
	}
}
