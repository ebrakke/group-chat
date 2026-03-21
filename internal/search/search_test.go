package search

import (
	"path/filepath"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
)

func setupTestDB(t *testing.T) (*db.DB, *messages.Service) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })

	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('alice', 'Alice', 'hash', 'admin')")
	d.Exec("INSERT INTO channels (name) VALUES ('general')")
	return d, messages.NewService(d)
}

func TestSearchMessages(t *testing.T) {
	d, msgSvc := setupTestDB(t)
	searchSvc := NewService(d)

	msgSvc.Create(1, 1, "hello world")
	msgSvc.Create(1, 1, "goodbye world")
	msgSvc.Create(1, 1, "something else")

	results, err := searchSvc.Search("hello", 50)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("count = %d, want 1", len(results))
	}
	if results[0].Content != "hello world" {
		t.Errorf("content = %q", results[0].Content)
	}
	if results[0].ChannelName != "general" {
		t.Errorf("channelName = %q", results[0].ChannelName)
	}
	if results[0].Username != "alice" {
		t.Errorf("username = %q", results[0].Username)
	}
}

func TestSearchNoResults(t *testing.T) {
	d, _ := setupTestDB(t)
	searchSvc := NewService(d)

	results, err := searchSvc.Search("nonexistent", 50)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("count = %d, want 0", len(results))
	}
}

func TestSearchMultipleWords(t *testing.T) {
	d, msgSvc := setupTestDB(t)
	searchSvc := NewService(d)

	msgSvc.Create(1, 1, "the quick brown fox")
	msgSvc.Create(1, 1, "the slow brown dog")

	results, err := searchSvc.Search("quick fox", 50)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("count = %d, want 1", len(results))
	}
}

func TestSearchExcludesDeletedMessages(t *testing.T) {
	d, msgSvc := setupTestDB(t)
	searchSvc := NewService(d)

	msg, _ := msgSvc.Create(1, 1, "findable message")
	msgSvc.Delete(msg.ID, 1, false)

	results, err := searchSvc.Search("findable", 50)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("count = %d, want 0 (deleted messages should be excluded)", len(results))
	}
}
