package notifications

import (
	"fmt"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestEnsureVAPIDKeys(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")

	pub, priv, err := svc.EnsureVAPIDKeys()
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys: %v", err)
	}
	if pub == "" || priv == "" {
		t.Fatal("expected non-empty keys")
	}

	pub2, priv2, err := svc.EnsureVAPIDKeys()
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys second call: %v", err)
	}
	if pub2 != pub || priv2 != priv {
		t.Fatal("expected same keys on second call")
	}
}

func TestWebPushSubscriptionCRUD(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")
	database.Exec(`INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (1, 'test', 'x', 'Test', 'admin', datetime('now'))`)

	sub := WebPushSubscription{
		Endpoint:  "https://push.example.com/sub1",
		P256dh:    "BNcRdreAL...",
		Auth:      "tBHItJI5...",
		UserAgent: "Chrome/120",
	}

	err := svc.SaveWebPushSubscription(1, sub)
	if err != nil {
		t.Fatalf("SaveWebPushSubscription: %v", err)
	}

	subs, err := svc.GetWebPushSubscriptions(1)
	if err != nil {
		t.Fatalf("GetWebPushSubscriptions: %v", err)
	}
	if len(subs) != 1 {
		t.Fatalf("expected 1 subscription, got %d", len(subs))
	}
	if subs[0].Endpoint != sub.Endpoint {
		t.Fatalf("endpoint mismatch: %s", subs[0].Endpoint)
	}

	err = svc.SaveWebPushSubscription(1, sub)
	if err != nil {
		t.Fatalf("SaveWebPushSubscription upsert: %v", err)
	}
	subs, _ = svc.GetWebPushSubscriptions(1)
	if len(subs) != 1 {
		t.Fatalf("expected 1 after upsert, got %d", len(subs))
	}

	err = svc.DeleteWebPushSubscription(sub.Endpoint)
	if err != nil {
		t.Fatalf("DeleteWebPushSubscription: %v", err)
	}
	subs, _ = svc.GetWebPushSubscriptions(1)
	if len(subs) != 0 {
		t.Fatalf("expected 0 after delete, got %d", len(subs))
	}
}

func TestWebPushSubscriptionLimit(t *testing.T) {
	database := setupTestDB(t)
	svc := NewService(database, "http://localhost")
	database.Exec(`INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (1, 'test', 'x', 'Test', 'admin', datetime('now'))`)

	for i := 0; i < 10; i++ {
		err := svc.SaveWebPushSubscription(1, WebPushSubscription{
			Endpoint: fmt.Sprintf("https://push.example.com/sub%d", i),
			P256dh:   "key",
			Auth:     "auth",
		})
		if err != nil {
			t.Fatalf("sub %d: %v", i, err)
		}
	}

	err := svc.SaveWebPushSubscription(1, WebPushSubscription{
		Endpoint: "https://push.example.com/sub10",
		P256dh:   "key",
		Auth:     "auth",
	})
	if err == nil {
		t.Fatal("expected error for 11th subscription")
	}
}
