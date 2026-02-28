# Core Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file uploads, message editing/deletion, and search to Relay Chat.

**Architecture:** Each feature follows the existing pattern: SQL migration → Go service → API handler → WebSocket event → frontend store → Svelte component. All features use SQLite, the existing `internal/db` migration system, and the established class-based Svelte 5 store pattern.

**Tech Stack:** Go 1.24, SQLite (modernc.org/sqlite), SvelteKit 5 (runes), Tailwind CSS v4, Bun

---

### Task 1: Message Edit/Delete — Backend

Add the ability to edit and soft-delete messages. This is the simplest feature to start with since it only modifies existing tables and services.

**Files:**
- Create: `internal/db/migrations/013_edit_delete.sql`
- Modify: `internal/messages/messages.go` — add Edit(), Delete() methods, update queries
- Modify: `internal/api/api.go` — add routes and handlers
- Modify: `internal/messages/messages_test.go` — add tests
- Modify: `internal/api/api_test.go` — add tests

**Step 1: Write the migration**

Create `internal/db/migrations/013_edit_delete.sql`:

```sql
ALTER TABLE messages ADD COLUMN edited_at TEXT;
ALTER TABLE messages ADD COLUMN deleted_at TEXT;
```

No separate edit history table — keep it simple. Only the current content is stored.

**Step 2: Write failing tests for Edit and Delete**

Add to `internal/messages/messages_test.go`:

```go
func TestEditMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, _ := svc.Create(1, 1, "original", "general")

	edited, err := svc.Edit(msg.ID, 1, "updated content")
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if edited.Content != "updated content" {
		t.Errorf("content = %q, want %q", edited.Content, "updated content")
	}
	if edited.EditedAt == nil {
		t.Error("editedAt should be set")
	}
}

func TestEditMessageWrongUser(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, _ := svc.Create(1, 1, "original", "general")

	_, err := svc.Edit(msg.ID, 2, "hacked")
	if err == nil {
		t.Fatal("expected error editing another user's message")
	}
}

func TestDeleteMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, _ := svc.Create(1, 1, "to delete", "general")

	err := svc.Delete(msg.ID, 1, false)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	// Message should still exist but be soft-deleted
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.DeletedAt == nil {
		t.Error("deletedAt should be set")
	}
}

func TestDeleteMessageAdmin(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// User 1 creates, user 2 (non-owner) deletes as admin
	msg, _ := svc.Create(1, 1, "admin delete", "general")

	err := svc.Delete(msg.ID, 2, true)
	if err != nil {
		t.Fatalf("admin delete: %v", err)
	}
}

func TestDeleteMessageWrongUser(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, _ := svc.Create(1, 1, "not yours", "general")

	err := svc.Delete(msg.ID, 2, false)
	if err == nil {
		t.Fatal("expected error deleting another user's message")
	}
}

func TestDeletedMessagesExcludedFromList(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	svc.Create(1, 1, "msg1", "general")
	msg2, _ := svc.Create(1, 1, "msg2", "general")
	svc.Create(1, 1, "msg3", "general")

	svc.Delete(msg2.ID, 1, false)

	msgs, err := svc.ListChannel(1, 50, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("count = %d, want 2", len(msgs))
	}
}
```

**Step 3: Run tests to verify they fail**

Run: `cd /home/dev/code/relay-chat && go test ./internal/messages/ -run 'TestEdit|TestDelete' -v`
Expected: Compilation errors (Edit/Delete methods don't exist yet)

**Step 4: Implement Edit and Delete in messages.go**

Add to `internal/messages/messages.go`:

1. Update the `Message` struct to add `EditedAt` and `DeletedAt` fields:
```go
type Message struct {
	// ... existing fields ...
	EditedAt  *string `json:"editedAt,omitempty"`
	DeletedAt *string `json:"deletedAt,omitempty"`
}
```

2. Add error variables:
```go
var ErrForbidden = errors.New("forbidden")
```

3. Add Edit method:
```go
func (s *Service) Edit(messageID, userID int64, newContent string) (*Message, error) {
	msg, err := s.GetByID(messageID)
	if err != nil {
		return nil, err
	}
	if msg.UserID != userID {
		return nil, ErrForbidden
	}

	now := time.Now().UTC().Format(time.RFC3339)
	mentions := extractMentions(newContent)
	mentionsJSON, _ := json.Marshal(mentions)
	previews := fetchLinkPreviews(newContent)
	var previewsJSON []byte
	if len(previews) > 0 {
		previewsJSON, _ = json.Marshal(previews)
	}

	_, err = s.db.Exec(
		"UPDATE messages SET content = ?, mentions = ?, link_previews = ?, edited_at = ? WHERE id = ?",
		newContent, mentionsJSON, previewsJSON, now, messageID,
	)
	if err != nil {
		return nil, err
	}
	return s.GetByID(messageID)
}
```

4. Add Delete method:
```go
func (s *Service) Delete(messageID, userID int64, isAdmin bool) error {
	msg, err := s.GetByID(messageID)
	if err != nil {
		return err
	}
	if msg.UserID != userID && !isAdmin {
		return ErrForbidden
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec("UPDATE messages SET deleted_at = ? WHERE id = ?", now, messageID)
	return err
}
```

5. Update `GetByID` to scan the new columns — add `edited_at` and `deleted_at` to the SELECT and Scan. Use `sql.NullString` for both nullable fields.

6. Update `ListChannel` and `ListThread` queries to add `AND m.deleted_at IS NULL` to WHERE clauses, and also scan the new columns.

7. Update `ListUserThreads` — the parent message query should also exclude deleted parents if desired, or at minimum the reply counting should handle deleted replies.

**Step 5: Run tests to verify they pass**

Run: `cd /home/dev/code/relay-chat && go test ./internal/messages/ -v`
Expected: All tests PASS

**Step 6: Add API handlers**

In `internal/api/api.go`:

1. Add routes in `routes()`:
```go
// Edit/Delete messages
h.mux.HandleFunc("PUT /api/messages/{id}", h.handleEditMessage)
h.mux.HandleFunc("DELETE /api/messages/{id}", h.handleDeleteMessage)
```

2. Add handler implementations:
```go
func (h *Handler) handleEditMessage(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeErr(w, http.StatusBadRequest, errors.New("content required"))
		return
	}
	msg, err := h.messages.Edit(messageID, user.ID, req.Content)
	if errors.Is(err, messages.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if errors.Is(err, messages.ErrForbidden) {
		writeErr(w, http.StatusForbidden, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	h.hub.Broadcast(ws.Event{Type: "message_edited", Payload: msg, ChannelID: msg.ChannelID})
	writeJSON(w, http.StatusOK, msg)
}

func (h *Handler) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}
	// Get message first for the channel ID (needed for broadcast)
	msg, err := h.messages.GetByID(messageID)
	if errors.Is(err, messages.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	err = h.messages.Delete(messageID, user.ID, user.Role == "admin")
	if errors.Is(err, messages.ErrForbidden) {
		writeErr(w, http.StatusForbidden, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	h.hub.Broadcast(ws.Event{
		Type:      "message_deleted",
		Payload:   map[string]int64{"messageId": messageID},
		ChannelID: msg.ChannelID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
```

**Step 7: Add API tests**

Add to `internal/api/api_test.go` — test the edit and delete endpoints following the existing `doReqWithCookie` pattern. Bootstrap a user, create a message, then edit/delete it.

**Step 8: Run all tests**

Run: `cd /home/dev/code/relay-chat && go test ./... -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add internal/db/migrations/013_edit_delete.sql internal/messages/messages.go internal/messages/messages_test.go internal/api/api.go internal/api/api_test.go
git commit -m "feat: add message edit and delete (backend)"
```

---

### Task 2: Message Edit/Delete — Frontend

Wire up edit/delete UI in the chat interface with WebSocket real-time updates.

**Files:**
- Modify: `frontend/src/lib/types.ts` — add editedAt, deletedAt to Message
- Modify: `frontend/src/lib/stores/messages.svelte.ts` — add editMessage(), deleteMessage(), updateMessage(), removeMessage()
- Modify: `frontend/src/lib/components/Message.svelte` — add edit/delete buttons, inline edit mode, edited indicator
- Modify: `frontend/src/lib/ws.svelte.ts` — handle message_edited, message_deleted events
- Modify: `frontend/src/lib/api.ts` — no changes needed (generic api() already works)

**Step 1: Update TypeScript types**

In `frontend/src/lib/types.ts`, update the Message interface:

```typescript
export interface Message {
  id: number;
  channelId: number;
  userId?: number;
  parentId?: number | null;
  content: string;
  createdAt: string;
  editedAt?: string | null;   // ADD
  deletedAt?: string | null;  // ADD
  username?: string;
  displayName: string;
  replyCount?: number;
  isBot?: boolean;
  mentions?: string[];
  reactions?: Reaction[];
  linkPreviews?: LinkPreview[];
}
```

**Step 2: Update MessageStore**

In `frontend/src/lib/stores/messages.svelte.ts`, add methods:

```typescript
async editMessage(messageId: number, content: string) {
  return await api<Message>('PUT', `/api/messages/${messageId}`, { content });
}

async deleteMessage(messageId: number) {
  await api('DELETE', `/api/messages/${messageId}`);
}

updateMessage(updated: Message) {
  const channelId = updated.channelId;
  const messages = this.byChannel[channelId];
  if (!messages) return;
  const idx = messages.findIndex((m) => m.id === updated.id);
  if (idx === -1) return;
  const copy = [...messages];
  copy[idx] = { ...copy[idx], ...updated };
  this.byChannel[channelId] = copy;
}

removeMessage(messageId: number) {
  for (const channelId of Object.keys(this.byChannel)) {
    const messages = this.byChannel[Number(channelId)];
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) continue;
    this.byChannel[Number(channelId)] = messages.filter((m) => m.id !== messageId);
    break;
  }
}
```

**Step 3: Update WebSocket handler**

In `frontend/src/lib/ws.svelte.ts`, add cases in `handleEvent()` switch:

```typescript
case 'message_edited':
  if (payload) {
    messageStore.updateMessage(payload);
  }
  break;
case 'message_deleted':
  if (payload) {
    messageStore.removeMessage(payload.messageId);
  }
  break;
```

**Step 4: Update Message.svelte**

Add edit/delete functionality to `frontend/src/lib/components/Message.svelte`:

1. Add new state variables:
```typescript
let editing = $state(false);
let editText = $state('');
```

2. Add edit/delete functions:
```typescript
async function startEdit() {
  editText = message.content;
  editing = true;
}

async function saveEdit() {
  if (!editText.trim() || editText === message.content) {
    editing = false;
    return;
  }
  try {
    await messageStore.editMessage(message.id, editText);
    editing = false;
  } catch {
    // ignore
  }
}

function cancelEdit() {
  editing = false;
}

async function handleDelete() {
  try {
    await messageStore.deleteMessage(message.id);
  } catch {
    // ignore
  }
}

function handleEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saveEdit();
  }
  if (e.key === 'Escape') {
    cancelEdit();
  }
}
```

3. Add "edit" and "delete" buttons next to the existing "reply" and "react" buttons in the hover actions area. Only show for messages owned by the current user (or admin for delete). Use the same `text-[11px]` styling pattern as existing buttons.

4. When `editing` is true, replace the message body with a textarea pre-filled with content. Show save/cancel buttons.

5. Show "(edited)" indicator next to timestamp when `message.editedAt` is set.

Import `messageStore` at the top of the script block.

**Step 5: Build and verify**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/stores/messages.svelte.ts frontend/src/lib/components/Message.svelte frontend/src/lib/ws.svelte.ts
git commit -m "feat: add message edit and delete (frontend)"
```

---

### Task 3: File Upload — Backend

Add file upload support with local filesystem storage and optional S3.

**Files:**
- Create: `internal/db/migrations/014_file_uploads.sql`
- Create: `internal/files/files.go` — file storage service
- Modify: `internal/api/api.go` — add upload/serve/delete routes
- Modify: `cmd/app/main.go` — wire file service, add upload serving route
- Create: `internal/files/files_test.go`

**Step 1: Write the migration**

Create `internal/db/migrations/014_file_uploads.sql`:

```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_files_message ON files(message_id);
```

Note: `filename` is the stored filename (randomized), `original_name` is what the user uploaded. Files are stored on disk at `DATA_DIR/uploads/<filename>`. No separate storage_path column needed since the directory is fixed.

**Step 2: Write the file service**

Create `internal/files/files.go`:

```go
package files

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

var ErrNotFound = errors.New("file not found")
var ErrTooLarge = errors.New("file too large")

type File struct {
	ID           int64  `json:"id"`
	MessageID    *int64 `json:"messageId,omitempty"`
	Filename     string `json:"filename"`
	OriginalName string `json:"originalName"`
	MimeType     string `json:"mimeType"`
	SizeBytes    int64  `json:"sizeBytes"`
	UploaderID   int64  `json:"uploaderId"`
	CreatedAt    string `json:"createdAt"`
}

type Service struct {
	db         *db.DB
	uploadDir  string
	maxSize    int64 // bytes
}

func NewService(database *db.DB, uploadDir string, maxSize int64) *Service {
	os.MkdirAll(uploadDir, 0755)
	return &Service{db: database, uploadDir: uploadDir, maxSize: maxSize}
}

func (s *Service) Upload(uploaderID int64, originalName, mimeType string, size int64, r io.Reader) (*File, error) {
	if size > s.maxSize {
		return nil, ErrTooLarge
	}

	// Generate random filename preserving extension
	ext := filepath.Ext(originalName)
	randName := randomHex(16) + ext
	diskPath := filepath.Join(s.uploadDir, randName)

	f, err := os.Create(diskPath)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	written, err := io.Copy(f, io.LimitReader(r, s.maxSize+1))
	if err != nil {
		os.Remove(diskPath)
		return nil, fmt.Errorf("write file: %w", err)
	}
	if written > s.maxSize {
		os.Remove(diskPath)
		return nil, ErrTooLarge
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO files (filename, original_name, mime_type, size_bytes, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		randName, originalName, mimeType, written, uploaderID, now,
	)
	if err != nil {
		os.Remove(diskPath)
		return nil, err
	}

	id, _ := res.LastInsertId()
	return &File{
		ID:           id,
		Filename:     randName,
		OriginalName: originalName,
		MimeType:     mimeType,
		SizeBytes:    written,
		UploaderID:   uploaderID,
		CreatedAt:    now,
	}, nil
}

func (s *Service) AttachToMessage(fileID, messageID int64) error {
	_, err := s.db.Exec("UPDATE files SET message_id = ? WHERE id = ?", messageID, fileID)
	return err
}

func (s *Service) GetByID(id int64) (*File, error) {
	var f File
	var messageID sql.NullInt64
	err := s.db.QueryRow(
		"SELECT id, message_id, filename, original_name, mime_type, size_bytes, uploader_id, created_at FROM files WHERE id = ?",
		id,
	).Scan(&f.ID, &messageID, &f.Filename, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.UploaderID, &f.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if messageID.Valid {
		f.MessageID = &messageID.Int64
	}
	return &f, nil
}

func (s *Service) ListByMessage(messageID int64) ([]File, error) {
	rows, err := s.db.Query(
		"SELECT id, message_id, filename, original_name, mime_type, size_bytes, uploader_id, created_at FROM files WHERE message_id = ? ORDER BY id",
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		var mid sql.NullInt64
		if err := rows.Scan(&f.ID, &mid, &f.Filename, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.UploaderID, &f.CreatedAt); err != nil {
			return nil, err
		}
		if mid.Valid {
			f.MessageID = &mid.Int64
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (s *Service) Delete(id int64) error {
	f, err := s.GetByID(id)
	if err != nil {
		return err
	}
	os.Remove(filepath.Join(s.uploadDir, f.Filename))
	_, err = s.db.Exec("DELETE FROM files WHERE id = ?", id)
	return err
}

func (s *Service) FilePath(filename string) string {
	// Sanitize to prevent directory traversal
	clean := filepath.Base(filename)
	return filepath.Join(s.uploadDir, clean)
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// IsImage returns true if the MIME type is an image type.
func IsImage(mimeType string) bool {
	return strings.HasPrefix(mimeType, "image/")
}
```

**Step 3: Write tests**

Create `internal/files/files_test.go`:

```go
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

	// Create a channel and message for FK
	d.Exec("INSERT INTO channels (name) VALUES ('general')")
	d.Exec("INSERT INTO channel_members (channel_id, user_id) VALUES (1, 1)")
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
```

**Step 4: Run tests**

Run: `cd /home/dev/code/relay-chat && go test ./internal/files/ -v`
Expected: All tests PASS

**Step 5: Add API handlers and routes**

In `internal/api/api.go`:

1. Add `files *files.Service` to the Handler struct and update the `New()` constructor to accept it.

2. Add routes:
```go
// Files
h.mux.HandleFunc("POST /api/upload", h.handleUploadFile)
h.mux.HandleFunc("GET /api/files/{id}", h.handleGetFile)
h.mux.HandleFunc("DELETE /api/files/{id}", h.handleDeleteFile)
```

3. Implement handlers:

`handleUploadFile`: Parse multipart form (max 10MB), get the file from form field "file", call `s.files.Upload()`, return the File JSON. Accept optional `messageId` form field to attach immediately.

`handleGetFile`: Look up file by ID, serve the file from disk using `http.ServeFile()`. Set appropriate Content-Type and Content-Disposition headers.

`handleDeleteFile`: Require auth, check ownership or admin, call `s.files.Delete()`.

**Step 6: Wire up in main.go**

In `cmd/app/main.go`:

1. Add import for `"github.com/ebrakke/relay-chat/internal/files"`
2. After `reactSvc` initialization, add:
```go
uploadDir := filepath.Join(dataDir(), "uploads")
maxUploadSize := int64(10 << 20) // 10MB default
fileSvc := files.NewService(database, uploadDir, maxUploadSize)
```
3. Update `api.New()` call to pass `fileSvc`.

**Step 7: Update api_test.go setup**

Update the `setup()` function in `internal/api/api_test.go` to create a file service and pass it to `api.New()`.

**Step 8: Run all tests**

Run: `cd /home/dev/code/relay-chat && go test ./... -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add internal/db/migrations/014_file_uploads.sql internal/files/ internal/api/api.go internal/api/api_test.go cmd/app/main.go
git commit -m "feat: add file upload support (backend)"
```

---

### Task 4: File Upload — Frontend

Add file upload UI with drag-and-drop, paste, and file picker. Show images inline and other files as download links.

**Files:**
- Modify: `frontend/src/lib/types.ts` — add FileAttachment type, update Message
- Create: `frontend/src/lib/stores/files.svelte.ts` — upload store
- Modify: `frontend/src/lib/components/MessageInput.svelte` — add file upload UI
- Create: `frontend/src/lib/components/FilePreview.svelte` — render file attachments
- Modify: `frontend/src/lib/components/Message.svelte` — show attached files
- Modify: `frontend/src/lib/stores/messages.svelte.ts` — include files when loading messages
- Modify: `frontend/src/lib/api.ts` — add uploadFile function for multipart upload

**Step 1: Add types**

In `frontend/src/lib/types.ts`:

```typescript
export interface FileAttachment {
  id: number;
  messageId?: number;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: number;
  createdAt: string;
}
```

Update Message interface to add:
```typescript
files?: FileAttachment[];
```

**Step 2: Add upload helper to api.ts**

In `frontend/src/lib/api.ts`, add a function for multipart uploads (the existing `api()` function only does JSON):

```typescript
export async function uploadFile(file: File, messageId?: number): Promise<FileAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (messageId) form.append('messageId', String(messageId));

  const headers: Record<string, string> = {};
  const opts: RequestInit = { method: 'POST', body: form, headers };

  if (isNative() && sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = 'include';
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/upload`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as FileAttachment;
}
```

Note: Do NOT set Content-Type header — the browser sets it automatically with the multipart boundary.

**Step 3: Create FilePreview component**

Create `frontend/src/lib/components/FilePreview.svelte`:

A simple component that takes a `FileAttachment` prop. For images (`mimeType.startsWith('image/')`), render an `<img>` tag with the file URL (`/api/files/{id}`), max-width ~400px, clickable to open full size. For other files, render a download link showing filename and size.

**Step 4: Update MessageInput.svelte**

Add file upload capabilities to `frontend/src/lib/components/MessageInput.svelte`:

1. Add a hidden `<input type="file">` element and a button to trigger it (next to the send button).
2. Add drag-and-drop handlers on the composer div (`ondragover`, `ondrop`).
3. Add paste handler that checks for files in `e.clipboardData.files`.
4. When files are selected, upload them via `uploadFile()`, then insert a reference into the message content or send the message with the file attached.

The simplest approach: upload the file first to get a file ID, then when sending the message, include the file IDs. OR: upload produces a markdown-like link `![filename](/api/files/{id})` that gets inserted into the message content.

Recommended approach: Upload files, get back File objects. Store pending file IDs in state. When sending the message, send the message first, then attach files to it via `POST /api/upload` with `messageId`. Display a small preview of pending files above the input.

**Step 5: Update Message.svelte**

Import `FilePreview` and render it for each file in `message.files` array, below the message content and above reactions.

**Step 6: Load files with messages**

The backend should include files when returning messages. Two options:
- Option A: Add a JOIN in the messages query (complex, changes many queries)
- Option B: Frontend fetches files separately per message (too many requests)
- Option C: Backend returns files as a nested field in the message JSON

Recommended: **Option C** — modify the Go `GetByID` and list methods to also query files and attach them to the Message struct. Add `Files []files.File` to the Message struct in Go.

This requires modifying `internal/messages/messages.go` to accept a file service or to query files inline. The simplest approach: add a `SetFileService` method on the message service, and in `GetByID`/`ListChannel`/`ListThread`, after building messages, bulk-fetch files for those message IDs and attach them.

**Step 7: Build and verify**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No TypeScript errors

**Step 8: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/components/FilePreview.svelte frontend/src/lib/components/MessageInput.svelte frontend/src/lib/components/Message.svelte frontend/src/lib/stores/messages.svelte.ts
git commit -m "feat: add file upload support (frontend)"
```

---

### Task 5: Search — Backend

Add full-text search using SQLite FTS5.

**Files:**
- Create: `internal/db/migrations/015_search.sql`
- Create: `internal/search/search.go`
- Create: `internal/search/search_test.go`
- Modify: `internal/api/api.go` — add search route and handler
- Modify: `cmd/app/main.go` — wire search service

**Step 1: Write the FTS5 migration**

Create `internal/db/migrations/015_search.sql`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content='messages',
    content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER messages_fts_au AFTER UPDATE OF content ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Backfill existing messages
INSERT INTO messages_fts(rowid, content) SELECT id, content FROM messages;
```

This uses FTS5 content-sync (external content table) so the FTS index doesn't duplicate data.

**Step 2: Write the search service**

Create `internal/search/search.go`:

```go
package search

import (
	"github.com/ebrakke/relay-chat/internal/db"
)

type Result struct {
	ID          int64  `json:"id"`
	ChannelID   int64  `json:"channelId"`
	ChannelName string `json:"channelName"`
	UserID      int64  `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Content     string `json:"content"`
	CreatedAt   string `json:"createdAt"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func (s *Service) Search(query string, limit int) ([]Result, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := s.db.Query(`
		SELECT m.id, m.channel_id, c.name, m.user_id, u.username, u.display_name, m.content, m.created_at
		FROM messages m
		JOIN messages_fts mf ON m.id = mf.rowid
		JOIN users u ON m.user_id = u.id
		JOIN channels c ON m.channel_id = c.id
		WHERE messages_fts MATCH ?
		AND m.deleted_at IS NULL
		AND m.parent_id IS NULL
		ORDER BY mf.rank
		LIMIT ?
	`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var r Result
		if err := rows.Scan(&r.ID, &r.ChannelID, &r.ChannelName, &r.UserID, &r.Username, &r.DisplayName, &r.Content, &r.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}
```

**Step 3: Write tests**

Create `internal/search/search_test.go`:

```go
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
	d.Exec("INSERT INTO channel_members (channel_id, user_id) VALUES (1, 1)")

	return d, messages.NewService(d)
}

func TestSearchMessages(t *testing.T) {
	d, msgSvc := setupTestDB(t)
	searchSvc := NewService(d)

	msgSvc.Create(1, 1, "hello world", "general")
	msgSvc.Create(1, 1, "goodbye world", "general")
	msgSvc.Create(1, 1, "something else", "general")

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
```

**Step 4: Run tests**

Run: `cd /home/dev/code/relay-chat && go test ./internal/search/ -v`
Expected: All tests PASS

**Step 5: Add API route and handler**

In `internal/api/api.go`:

1. Add `search *search.Service` to Handler struct, update constructor.
2. Add route: `h.mux.HandleFunc("GET /api/search", h.handleSearch)`
3. Implement handler:

```go
func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		writeErr(w, http.StatusBadRequest, errors.New("q parameter required"))
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	results, err := h.search.Search(q, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if results == nil {
		results = []search.Result{}
	}
	writeJSON(w, http.StatusOK, results)
}
```

**Step 6: Wire up in main.go**

Add `searchSvc := search.NewService(database)` and pass to `api.New()`.

**Step 7: Update api_test.go setup**

Update `setup()` to create search service and pass to `api.New()`.

**Step 8: Run all tests**

Run: `cd /home/dev/code/relay-chat && go test ./... -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add internal/db/migrations/015_search.sql internal/search/ internal/api/api.go internal/api/api_test.go cmd/app/main.go
git commit -m "feat: add full-text search (backend)"
```

---

### Task 6: Search — Frontend

Add search UI with results that link back to messages in channels.

**Files:**
- Modify: `frontend/src/lib/types.ts` — add SearchResult type
- Create: `frontend/src/lib/stores/search.svelte.ts`
- Create: `frontend/src/lib/components/SearchPanel.svelte`
- Modify: `frontend/src/routes/(app)/+layout.svelte` — add search toggle to header

**Step 1: Add types**

In `frontend/src/lib/types.ts`:

```typescript
export interface SearchResult {
  id: number;
  channelId: number;
  channelName: string;
  userId: number;
  username: string;
  displayName: string;
  content: string;
  createdAt: string;
}
```

**Step 2: Create search store**

Create `frontend/src/lib/stores/search.svelte.ts`:

```typescript
import { api } from '$lib/api';
import type { SearchResult } from '$lib/types';

class SearchStore {
  results = $state<SearchResult[]>([]);
  query = $state('');
  loading = $state(false);
  open = $state(false);

  async search(query: string) {
    if (!query.trim()) {
      this.results = [];
      this.query = '';
      return;
    }
    this.loading = true;
    this.query = query;
    try {
      this.results = await api<SearchResult[]>(
        'GET',
        `/api/search?q=${encodeURIComponent(query)}&limit=50`
      );
    } catch {
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  toggle() {
    this.open = !this.open;
    if (!this.open) {
      this.results = [];
      this.query = '';
    }
  }

  close() {
    this.open = false;
    this.results = [];
    this.query = '';
  }
}

export const searchStore = new SearchStore();
```

**Step 3: Create SearchPanel component**

Create `frontend/src/lib/components/SearchPanel.svelte`:

A panel (could overlay or slide in) with:
- Text input with debounced search (300ms)
- Results list showing: channel name, username, content preview, timestamp
- Click a result to navigate to `/channels/{channelId}` and close search
- Use the existing app styling (var(--foreground), var(--border), etc.)
- "No results" empty state
- Loading indicator

**Step 4: Add search toggle to layout**

In `frontend/src/routes/(app)/+layout.svelte`, add a search button/icon in the header area. When clicked, toggle `searchStore.open`. When open, render `<SearchPanel />`.

**Step 5: Build and verify**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/stores/search.svelte.ts frontend/src/lib/components/SearchPanel.svelte frontend/src/routes/(app)/+layout.svelte
git commit -m "feat: add search UI (frontend)"
```

---

### Task 7: Integration Testing & Polish

End-to-end verification that all features work together.

**Files:**
- Modify: `tests/e2e/tests/e2e.spec.ts` — add E2E tests for new features

**Step 1: Add E2E tests**

Add test cases to the existing E2E test file:

1. **Edit message**: Send a message, click edit, change content, verify updated content appears.
2. **Delete message**: Send a message, click delete, verify message disappears.
3. **File upload**: Upload an image via the file picker, verify it appears in the message.
4. **Search**: Send a message with unique content, open search, type the content, verify the message appears in results.

Follow the existing patterns in the test file (serial test groups, element selectors, timeouts for WebSocket events).

**Step 2: Run E2E tests**

Run: `cd /home/dev/code/relay-chat && make test-e2e`
Expected: All tests PASS

**Step 3: Run full test suite**

Run: `cd /home/dev/code/relay-chat && go test ./... && cd frontend && bun run check`
Expected: All pass

**Step 4: Commit**

```bash
git add tests/e2e/tests/e2e.spec.ts
git commit -m "test: add E2E tests for edit, delete, upload, and search"
```
