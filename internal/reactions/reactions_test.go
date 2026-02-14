package reactions

import (
	"path/filepath"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })

	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('alice', 'Alice', 'hash', 'admin')")
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('bob', 'Bob', 'hash', 'member')")
	d.Exec("INSERT INTO channels (name) VALUES ('general')")
	d.Exec("INSERT INTO channel_members (channel_id, user_id) VALUES (1, 1)")
	d.Exec("INSERT INTO channel_members (channel_id, user_id) VALUES (1, 2)")
	d.Exec("INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (1, 1, 'hello', '2024-01-01T00:00:00Z')")
	d.Exec("INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (1, 2, 'world', '2024-01-01T00:00:01Z')")

	return d
}

func TestAddReaction(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	r, err := svc.Add(1, 1, "👍", "general")
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if r.Emoji != "👍" {
		t.Errorf("emoji = %q", r.Emoji)
	}
	if r.MessageID != 1 {
		t.Errorf("messageId = %d", r.MessageID)
	}
	if r.Username != "alice" {
		t.Errorf("username = %q", r.Username)
	}
}

func TestAddReactionIdempotent(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	r1, err := svc.Add(1, 1, "👍", "general")
	if err != nil {
		t.Fatalf("add1: %v", err)
	}

	r2, err := svc.Add(1, 1, "👍", "general")
	if err != nil {
		t.Fatalf("add2: %v", err)
	}
	if r1.ID != r2.ID {
		t.Errorf("expected same reaction, got id %d and %d", r1.ID, r2.ID)
	}
}

func TestInvalidEmoji(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	_, err := svc.Add(1, 1, "💩", "general")
	if err != ErrInvalidEmoji {
		t.Errorf("expected ErrInvalidEmoji, got %v", err)
	}
}

func TestRemoveReaction(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	svc.Add(1, 1, "👍", "general")

	err := svc.Remove(1, 1, "👍")
	if err != nil {
		t.Fatalf("remove: %v", err)
	}

	// Remove again should be not found
	err = svc.Remove(1, 1, "👍")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestToggleReaction(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Toggle on
	r, added, err := svc.Toggle(1, 1, "❤️", "general")
	if err != nil {
		t.Fatalf("toggle on: %v", err)
	}
	if !added {
		t.Error("expected added=true")
	}
	if r == nil {
		t.Fatal("expected reaction")
	}

	// Toggle off
	r, added, err = svc.Toggle(1, 1, "❤️", "general")
	if err != nil {
		t.Fatalf("toggle off: %v", err)
	}
	if added {
		t.Error("expected added=false")
	}
	if r != nil {
		t.Error("expected nil reaction on remove")
	}

	// Toggle on again
	r, added, err = svc.Toggle(1, 1, "❤️", "general")
	if err != nil {
		t.Fatalf("toggle on again: %v", err)
	}
	if !added {
		t.Error("expected added=true")
	}
}

func TestSummaryForMessages(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	svc.Add(1, 1, "👍", "general")
	svc.Add(1, 2, "👍", "general")
	svc.Add(1, 1, "❤️", "general")
	svc.Add(2, 2, "🔥", "general")

	summaries, err := svc.SummaryForMessages([]int64{1, 2})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}

	msg1 := summaries[1]
	if len(msg1) != 2 {
		t.Fatalf("msg1 emoji count = %d, want 2", len(msg1))
	}
	// 👍 should have count 2
	found := false
	for _, s := range msg1 {
		if s.Emoji == "👍" {
			found = true
			if s.Count != 2 {
				t.Errorf("👍 count = %d, want 2", s.Count)
			}
			if len(s.UserIDs) != 2 {
				t.Errorf("👍 userIds = %d, want 2", len(s.UserIDs))
			}
		}
	}
	if !found {
		t.Error("expected 👍 in summaries")
	}

	msg2 := summaries[2]
	if len(msg2) != 1 {
		t.Fatalf("msg2 emoji count = %d, want 1", len(msg2))
	}
	if msg2[0].Emoji != "🔥" || msg2[0].Count != 1 {
		t.Errorf("msg2 = %+v", msg2[0])
	}
}

func TestSummaryForMessagesEmpty(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	summaries, err := svc.SummaryForMessages([]int64{1})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if len(summaries[1]) != 0 {
		t.Errorf("expected empty summaries for message with no reactions")
	}
}

func TestNostrEventKind7(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	r, err := svc.Add(1, 1, "👍", "general")
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if len(r.EventID) != 64 {
		t.Errorf("eventId length = %d, want 64", len(r.EventID))
	}
}
