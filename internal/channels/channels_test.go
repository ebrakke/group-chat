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

func TestMembership(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	ch, _ := svc.Create("general")

	// Need a user - insert directly
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		"testuser", "Test", "hash", "member")

	err := svc.AddMember(ch.ID, 1)
	if err != nil {
		t.Fatalf("add member: %v", err)
	}

	is, _ := svc.IsMember(ch.ID, 1)
	if !is {
		t.Error("expected user to be member")
	}

	is, _ = svc.IsMember(ch.ID, 999)
	if is {
		t.Error("expected non-member")
	}

	// Idempotent add
	err = svc.AddMember(ch.ID, 1)
	if err != nil {
		t.Fatalf("add member again: %v", err)
	}

	members, _ := svc.ListMembers(ch.ID)
	if len(members) != 1 {
		t.Errorf("members = %d, want 1", len(members))
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
