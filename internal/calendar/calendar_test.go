package calendar

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
	// Calendar events reference users; ensure at least one user exists.
	_, _ = d.Exec("INSERT OR IGNORE INTO users (id, username, display_name, password_hash, role) VALUES (1, 'testuser', 'Test', 'hash', 'member')")
	return d
}

func TestCreateAndGetByID(t *testing.T) {
	svc := NewService(setupTestDB(t))
	start := "2025-07-15T09:00:00Z"
	end := "2025-07-15T09:30:00Z"

	ev, err := svc.Create(1, "Team standup", start, end, "Daily sync")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if ev.Title != "Team standup" {
		t.Errorf("title = %q", ev.Title)
	}
	if ev.StartTime != start || ev.EndTime != end {
		t.Errorf("times: %q, %q", ev.StartTime, ev.EndTime)
	}
	if ev.CreatedBy != 1 {
		t.Errorf("createdBy = %d", ev.CreatedBy)
	}

	got, err := svc.GetByID(ev.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ID != ev.ID || got.Title != ev.Title {
		t.Errorf("get by id: %+v", got)
	}
}

func TestCreateValidation(t *testing.T) {
	svc := NewService(setupTestDB(t))
	start := "2025-07-15T09:00:00Z"
	end := "2025-07-15T09:30:00Z"

	_, err := svc.Create(1, "", start, end, "")
	if err == nil {
		t.Fatal("expected error for empty title")
	}

	_, err = svc.Create(1, "OK", "not-a-time", end, "")
	if err == nil {
		t.Fatal("expected error for invalid startTime")
	}

	_, err = svc.Create(1, "OK", start, start, "")
	if err == nil {
		t.Fatal("expected error for endTime <= startTime")
	}
}

func TestUpdateAndDelete(t *testing.T) {
	svc := NewService(setupTestDB(t))
	ev, err := svc.Create(1, "Original", "2025-07-15T09:00:00Z", "2025-07-15T10:00:00Z", "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := svc.Update(ev.ID, 1, "Updated title", ev.StartTime, ev.EndTime, "notes")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Title != "Updated title" || updated.Comments != "notes" {
		t.Errorf("update: %+v", updated)
	}

	err = svc.Delete(ev.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err = svc.GetByID(ev.ID)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestListAndListRange(t *testing.T) {
	svc := NewService(setupTestDB(t))
	_, _ = svc.Create(1, "E1", "2025-07-01T09:00:00Z", "2025-07-01T10:00:00Z", "")
	_, _ = svc.Create(1, "E2", "2025-07-15T09:00:00Z", "2025-07-15T10:00:00Z", "")
	_, _ = svc.Create(1, "E3", "2025-07-20T09:00:00Z", "2025-07-20T10:00:00Z", "")

	all, err := svc.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("list count = %d, want 3", len(all))
	}

	// Range that overlaps only E2
	from := "2025-07-10T00:00:00Z"
	to := "2025-07-16T00:00:00Z"
	rangeEvs, err := svc.ListRange(from, to)
	if err != nil {
		t.Fatalf("list range: %v", err)
	}
	if len(rangeEvs) != 1 {
		t.Errorf("list range count = %d, want 1", len(rangeEvs))
	}
	if rangeEvs[0].Title != "E2" {
		t.Errorf("range event title = %q", rangeEvs[0].Title)
	}
}

func TestGetByIDNotFound(t *testing.T) {
	svc := NewService(setupTestDB(t))
	_, err := svc.GetByID(99999)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteNotFound(t *testing.T) {
	svc := NewService(setupTestDB(t))
	err := svc.Delete(99999)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
