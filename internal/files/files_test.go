package files

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) (*db.DB, string) {
	t.Helper()
	dir := t.TempDir()
	d, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })

	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('alice', 'Alice', 'hash', 'admin')")

	uploadDir := filepath.Join(dir, "uploads")
	return d, uploadDir
}

func TestUploadAndGet(t *testing.T) {
	d, uploadDir := setupTestDB(t)
	svc := NewService(d, uploadDir, 10<<20)

	f, err := svc.Upload(1, "test.png", "image/png", 5, strings.NewReader("hello"))
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if f.OriginalName != "test.png" {
		t.Errorf("originalName = %q", f.OriginalName)
	}
	if f.SizeBytes != 5 {
		t.Errorf("size = %d", f.SizeBytes)
	}

	got, err := svc.GetByID(f.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.OriginalName != "test.png" {
		t.Errorf("originalName = %q", got.OriginalName)
	}
}

func TestUploadTooLarge(t *testing.T) {
	d, uploadDir := setupTestDB(t)
	svc := NewService(d, uploadDir, 5) // 5 byte limit

	_, err := svc.Upload(1, "big.bin", "application/octet-stream", 100, strings.NewReader("this is way too long"))
	if err != ErrTooLarge {
		t.Errorf("err = %v, want ErrTooLarge", err)
	}
}

func TestAttachToMessage(t *testing.T) {
	d, uploadDir := setupTestDB(t)
	svc := NewService(d, uploadDir, 10<<20)

	d.Exec("INSERT INTO channels (name) VALUES ('general')")
	d.Exec("INSERT INTO messages (channel_id, user_id, content, event_id, created_at) VALUES (1, 1, 'test', 'evt1', datetime('now'))")

	f, _ := svc.Upload(1, "doc.pdf", "application/pdf", 3, strings.NewReader("pdf"))
	svc.AttachToMessage(f.ID, 1)

	files, err := svc.ListByMessage(1)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("count = %d, want 1", len(files))
	}
	if files[0].OriginalName != "doc.pdf" {
		t.Errorf("name = %q", files[0].OriginalName)
	}
}

func TestDeleteFile(t *testing.T) {
	d, uploadDir := setupTestDB(t)
	svc := NewService(d, uploadDir, 10<<20)

	f, _ := svc.Upload(1, "temp.txt", "text/plain", 4, strings.NewReader("temp"))
	err := svc.Delete(f.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = svc.GetByID(f.ID)
	if err != ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
