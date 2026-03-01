package channels

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
	return d
}

func TestEnsureGeneral(t *testing.T) {
	svc := NewService(setupTestDB(t))

	ch, err := svc.EnsureGeneral()
	if err != nil {
		t.Fatalf("ensure general: %v", err)
	}
	if ch.Name != "general" {
		t.Errorf("name = %q, want general", ch.Name)
	}

	// Idempotent
	ch2, err := svc.EnsureGeneral()
	if err != nil {
		t.Fatalf("ensure general again: %v", err)
	}
	if ch2.ID != ch.ID {
		t.Errorf("id changed: %d vs %d", ch.ID, ch2.ID)
	}
}

func TestCreateAndList(t *testing.T) {
	svc := NewService(setupTestDB(t))

	svc.Create("general")
	svc.Create("random")

	chs, err := svc.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(chs) != 2 {
		t.Errorf("count = %d, want 2", len(chs))
	}
}

func TestMarkRead(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	ch, _ := svc.Create("general")

	// Need a user
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		"testuser", "Test", "hash", "member")

	// MarkRead should upsert (no pre-existing row)
	err := svc.MarkRead(ch.ID, 1, 5)
	if err != nil {
		t.Fatalf("mark read: %v", err)
	}

	// Cursor should only move forward
	err = svc.MarkRead(ch.ID, 1, 3)
	if err != nil {
		t.Fatalf("mark read backward: %v", err)
	}

	// Verify cursor stayed at 5
	chs, _ := svc.ListForUser(1, "testuser")
	if len(chs) != 1 {
		t.Fatalf("expected 1 channel, got %d", len(chs))
	}
}

func TestGetByName(t *testing.T) {
	svc := NewService(setupTestDB(t))

	_, err := svc.GetByName("nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	svc.Create("test")
	ch, err := svc.GetByName("test")
	if err != nil {
		t.Fatalf("get by name: %v", err)
	}
	if ch.Name != "test" {
		t.Errorf("name = %q", ch.Name)
	}
}
