# Direct Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1-on-1 direct messaging using a "DM channel" approach that reuses existing message infrastructure.

**Architecture:** DMs are backed by regular channels with `is_dm = TRUE`. A `dm_conversations` table maps each conversation to a backing channel and its two participants. All existing message, thread, reaction, and file logic works unchanged through the backing channel. WebSocket filtering ensures only participants receive DM events.

**Tech Stack:** Go (backend service + API), SQLite (migration), SvelteKit 5 with runes (frontend stores + components), Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-22-direct-messages-design.md`

---

## File Structure

### New files
- `internal/db/migrations/024_direct_messages.sql` — schema migration
- `internal/dms/dms.go` — DM service (conversation CRUD, access checks)
- `internal/dms/dms_test.go` — DM service tests
- `frontend/src/lib/stores/dms.svelte.ts` — DM conversation store
- `frontend/src/lib/components/UserPicker.svelte` — user search/picker modal
- `frontend/src/routes/(app)/dms/[id]/+page.svelte` — DM conversation view

### Modified files
- `internal/ws/ws.go` — add DM filtering to Broadcast
- `internal/api/api.go` — add DM routes, DM access gate on channel routes, DM notification handling
- `internal/channels/channels.go` — filter `is_dm` channels from ListForUser
- `internal/notifications/notifications.go` — add SendDM method for DM-only notifications
- `cmd/app/main.go` — wire DM service
- `frontend/src/lib/types.ts` — add DMConversation type
- `frontend/src/lib/ws.svelte.ts` — handle DM WebSocket events
- `frontend/src/lib/components/Sidebar.svelte` — add DM section
- `frontend/src/lib/components/ProfilePanel.svelte` — add "Message" button
- `frontend/src/routes/(app)/+layout.svelte` — load DM store on mount

---

## Task 1: Database Migration

**Files:**
- Create: `internal/db/migrations/024_direct_messages.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 024_direct_messages.sql
ALTER TABLE channels ADD COLUMN is_dm BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE dm_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_dm_conversations_user1 ON dm_conversations(user1_id);
CREATE INDEX idx_dm_conversations_user2 ON dm_conversations(user2_id);
CREATE INDEX idx_dm_conversations_channel ON dm_conversations(channel_id);
```

- [ ] **Step 2: Verify migration runs**

Run: `cd /home/dev/code/relay-chat && make dev`
Expected: Server starts, migration 024 applies without error. Check logs for migration output.
Stop the server after verifying.

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/024_direct_messages.sql
git commit -m "feat(db): add migration 024 for direct messages"
```

---

## Task 2: DM Service — Core

**Files:**
- Create: `internal/dms/dms.go`
- Create: `internal/dms/dms_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// internal/dms/dms_test.go
package dms

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

func createTestUsers(t *testing.T, d *db.DB) {
	t.Helper()
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		"alice", "Alice", "hash", "member")
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		"bob", "Bob", "hash", "member")
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		"carol", "Carol", "hash", "member")
}

func TestGetOrCreateConversation(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	// Create new conversation
	conv, err := svc.GetOrCreate(1, 2)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if conv.User1ID != 1 || conv.User2ID != 2 {
		t.Errorf("users = (%d, %d), want (1, 2)", conv.User1ID, conv.User2ID)
	}
	if conv.ChannelID == 0 {
		t.Error("channel_id should be set")
	}

	// Idempotent — returns same conversation
	conv2, err := svc.GetOrCreate(1, 2)
	if err != nil {
		t.Fatalf("get existing: %v", err)
	}
	if conv2.ID != conv.ID {
		t.Errorf("id changed: %d vs %d", conv.ID, conv2.ID)
	}

	// Reversed order — same conversation
	conv3, err := svc.GetOrCreate(2, 1)
	if err != nil {
		t.Fatalf("get reversed: %v", err)
	}
	if conv3.ID != conv.ID {
		t.Errorf("reversed id: %d vs %d", conv3.ID, conv.ID)
	}
}

func TestGetOrCreateSelfDM(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	_, err := svc.GetOrCreate(1, 1)
	if err != ErrSelfDM {
		t.Errorf("expected ErrSelfDM, got %v", err)
	}
}

func TestListForUser(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	// Create two conversations for alice
	svc.GetOrCreate(1, 2) // alice-bob
	svc.GetOrCreate(1, 3) // alice-carol

	convs, err := svc.ListForUser(1)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(convs) != 2 {
		t.Errorf("count = %d, want 2", len(convs))
	}

	// Bob should only see 1
	convs2, err := svc.ListForUser(2)
	if err != nil {
		t.Fatalf("list bob: %v", err)
	}
	if len(convs2) != 1 {
		t.Errorf("bob count = %d, want 1", len(convs2))
	}
}

func TestIsParticipant(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	conv, _ := svc.GetOrCreate(1, 2)

	if !svc.IsParticipant(conv.ChannelID, 1) {
		t.Error("alice should be participant")
	}
	if !svc.IsParticipant(conv.ChannelID, 2) {
		t.Error("bob should be participant")
	}
	if svc.IsParticipant(conv.ChannelID, 3) {
		t.Error("carol should not be participant")
	}
}

func TestIsDMChannel(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	conv, _ := svc.GetOrCreate(1, 2)

	if !svc.IsDMChannel(conv.ChannelID) {
		t.Error("should be DM channel")
	}
	if svc.IsDMChannel(9999) {
		t.Error("nonexistent channel should not be DM")
	}
}

func TestGetByID(t *testing.T) {
	d := setupTestDB(t)
	createTestUsers(t, d)
	svc := NewService(d)

	conv, _ := svc.GetOrCreate(1, 2)

	got, err := svc.GetByID(conv.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ID != conv.ID {
		t.Errorf("id = %d, want %d", got.ID, conv.ID)
	}

	_, err = svc.GetByID(9999)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/dev/code/relay-chat && go test ./internal/dms/...`
Expected: FAIL — package doesn't exist yet

- [ ] **Step 3: Write the DM service**

```go
// internal/dms/dms.go
package dms

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/ebrakke/relay-chat/internal/db"
)

var (
	ErrNotFound = errors.New("dm conversation not found")
	ErrSelfDM   = errors.New("cannot start a DM with yourself")
)

// Conversation represents a DM conversation between two users.
type Conversation struct {
	ID        int64  `json:"id"`
	ChannelID int64  `json:"channelId"`
	User1ID   int64  `json:"user1Id"`
	User2ID   int64  `json:"user2Id"`
	CreatedAt string `json:"createdAt"`
}

// ConversationWithUser extends Conversation with the other user's info and unread state.
type ConversationWithUser struct {
	Conversation
	OtherUserID          int64  `json:"otherUserId"`
	OtherUsername        string `json:"otherUsername"`
	OtherDisplayName     string `json:"otherDisplayName"`
	OtherAvatarURL       string `json:"otherAvatarUrl,omitempty"`
	LastMessageContent   string `json:"lastMessageContent,omitempty"`
	LastMessageAt        string `json:"lastMessageAt,omitempty"`
	LastMessageSenderName string `json:"lastMessageSenderName,omitempty"`
	UnreadCount          int    `json:"unreadCount"`
}

// Service manages DM conversations.
type Service struct {
	db *db.DB
}

// NewService creates a new DM service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// GetOrCreate returns an existing DM conversation between two users, or creates one.
// User IDs are stored in canonical order (lower first) to prevent duplicates.
func (s *Service) GetOrCreate(userAID, userBID int64) (*Conversation, error) {
	if userAID == userBID {
		return nil, ErrSelfDM
	}

	// Canonical ordering: lower ID first
	user1, user2 := userAID, userBID
	if user1 > user2 {
		user1, user2 = user2, user1
	}

	// Try to find existing
	var conv Conversation
	err := s.db.QueryRow(`
		SELECT id, channel_id, user1_id, user2_id, created_at
		FROM dm_conversations
		WHERE user1_id = ? AND user2_id = ?
	`, user1, user2).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if err == nil {
		return &conv, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// Create backing channel
	channelName := fmt.Sprintf("dm-%d-%d", user1, user2)
	res, err := s.db.Exec("INSERT INTO channels (name, is_dm) VALUES (?, 1)", channelName)
	if err != nil {
		return nil, fmt.Errorf("create dm channel: %w", err)
	}
	channelID, _ := res.LastInsertId()

	// Create conversation
	res, err = s.db.Exec(
		"INSERT INTO dm_conversations (channel_id, user1_id, user2_id) VALUES (?, ?, ?)",
		channelID, user1, user2,
	)
	if err != nil {
		// Race condition: another request created it first
		// Try to fetch it again
		err2 := s.db.QueryRow(`
			SELECT id, channel_id, user1_id, user2_id, created_at
			FROM dm_conversations
			WHERE user1_id = ? AND user2_id = ?
		`, user1, user2).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
		if err2 != nil {
			return nil, fmt.Errorf("create dm conversation: %w", err)
		}
		return &conv, nil
	}

	convID, _ := res.LastInsertId()
	return s.GetByID(convID)
}

// GetByID returns a conversation by ID.
func (s *Service) GetByID(id int64) (*Conversation, error) {
	var conv Conversation
	err := s.db.QueryRow(`
		SELECT id, channel_id, user1_id, user2_id, created_at
		FROM dm_conversations WHERE id = ?
	`, id).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &conv, err
}

// GetByChannelID returns a conversation by its backing channel ID.
func (s *Service) GetByChannelID(channelID int64) (*Conversation, error) {
	var conv Conversation
	err := s.db.QueryRow(`
		SELECT id, channel_id, user1_id, user2_id, created_at
		FROM dm_conversations WHERE channel_id = ?
	`, channelID).Scan(&conv.ID, &conv.ChannelID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &conv, err
}

// ListForUser returns all DM conversations for a user with the other user's info and unread counts.
func (s *Service) ListForUser(userID int64) ([]ConversationWithUser, error) {
	rows, err := s.db.Query(`
		SELECT
			dc.id, dc.channel_id, dc.user1_id, dc.user2_id, dc.created_at,
			u.id, u.username, u.display_name, u.profile_picture_id,
			(SELECT content FROM messages WHERE channel_id = dc.channel_id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) AS last_content,
			(SELECT created_at FROM messages WHERE channel_id = dc.channel_id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) AS last_at,
			(SELECT u2.display_name FROM messages m2 JOIN users u2 ON m2.user_id = u2.id WHERE m2.channel_id = dc.channel_id AND m2.deleted_at IS NULL ORDER BY m2.id DESC LIMIT 1) AS last_sender,
			(SELECT COUNT(*) FROM messages m3
			 WHERE m3.channel_id = dc.channel_id
			   AND m3.parent_id IS NULL
			   AND m3.deleted_at IS NULL
			   AND m3.id > COALESCE((SELECT last_read_msg_id FROM channel_reads WHERE channel_id = dc.channel_id AND user_id = ?), 0)
			) AS unread_count
		FROM dm_conversations dc
		JOIN users u ON u.id = CASE WHEN dc.user1_id = ? THEN dc.user2_id ELSE dc.user1_id END
		WHERE dc.user1_id = ? OR dc.user2_id = ?
		ORDER BY COALESCE(
			(SELECT created_at FROM messages WHERE channel_id = dc.channel_id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1),
			dc.created_at
		) DESC
	`, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []ConversationWithUser
	for rows.Next() {
		var c ConversationWithUser
		var avatarFileID sql.NullInt64
		var lastContent, lastAt, lastSender sql.NullString
		if err := rows.Scan(
			&c.ID, &c.ChannelID, &c.User1ID, &c.User2ID, &c.CreatedAt,
			&c.OtherUserID, &c.OtherUsername, &c.OtherDisplayName, &avatarFileID,
			&lastContent, &lastAt, &lastSender,
			&c.UnreadCount,
		); err != nil {
			return nil, err
		}
		if avatarFileID.Valid {
			c.OtherAvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
		}
		if lastContent.Valid {
			c.LastMessageContent = lastContent.String
			if len(c.LastMessageContent) > 100 {
				c.LastMessageContent = c.LastMessageContent[:100] + "..."
			}
		}
		if lastAt.Valid {
			c.LastMessageAt = lastAt.String
		}
		if lastSender.Valid {
			c.LastMessageSenderName = lastSender.String
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}

// IsDMChannel checks if a channel ID belongs to a DM conversation.
func (s *Service) IsDMChannel(channelID int64) bool {
	var isDM bool
	err := s.db.QueryRow("SELECT is_dm FROM channels WHERE id = ?", channelID).Scan(&isDM)
	return err == nil && isDM
}

// IsParticipant checks if a user is a participant in a DM channel.
func (s *Service) IsParticipant(channelID, userID int64) bool {
	var count int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM dm_conversations
		WHERE channel_id = ? AND (user1_id = ? OR user2_id = ?)
	`, channelID, userID, userID).Scan(&count)
	return count > 0
}

// GetOtherUserID returns the other user's ID in a DM channel.
func (s *Service) GetOtherUserID(channelID, userID int64) (int64, error) {
	var user1, user2 int64
	err := s.db.QueryRow(`
		SELECT user1_id, user2_id FROM dm_conversations WHERE channel_id = ?
	`, channelID).Scan(&user1, &user2)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if userID == user1 {
		return user2, nil
	}
	return user1, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/dev/code/relay-chat && go test ./internal/dms/... -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add internal/dms/dms.go internal/dms/dms_test.go
git commit -m "feat(dms): add DM service with conversation CRUD and access checks"
```

---

## Task 3: Filter DM Channels from Channel List

**Files:**
- Modify: `internal/channels/channels.go:98-131` (ListForUser query)

- [ ] **Step 1: Update ListForUser to exclude DM channels**

In `internal/channels/channels.go`, modify the `ListForUser` SQL query to add `WHERE c.is_dm = 0` (or `WHERE NOT c.is_dm`):

Change the FROM/WHERE clause in the query from:
```sql
FROM channels c
LEFT JOIN channel_reads cm ON cm.channel_id = c.id AND cm.user_id = ?
ORDER BY c.name
```
to:
```sql
FROM channels c
LEFT JOIN channel_reads cm ON cm.channel_id = c.id AND cm.user_id = ?
WHERE c.is_dm = 0
ORDER BY c.name
```

Also update `List()` similarly to add `WHERE is_dm = 0`.

- [ ] **Step 2: Run existing channel tests**

Run: `cd /home/dev/code/relay-chat && go test ./internal/channels/... -v`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add internal/channels/channels.go
git commit -m "feat(channels): filter DM channels from channel list"
```

---

## Task 4: WebSocket DM Filtering

**Files:**
- Modify: `internal/ws/ws.go`

- [ ] **Step 1: Add DM filtering fields and methods to Hub**

Add to the Hub struct:
```go
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	AuthFunc func(token string) (*AuthResult, error)
	GetChannelIDsFunc func(userID int64) ([]int64, error)

	// DM filtering
	dmMu   sync.RWMutex
	dmChans map[int64][2]int64 // channel ID -> [user1_id, user2_id]
}
```

Update `NewHub`:
```go
func NewHub() *Hub {
	return &Hub{
		clients: make(map[*client]struct{}),
		dmChans: make(map[int64][2]int64),
	}
}
```

Add methods:
```go
// RegisterDMChannel registers a DM channel for broadcast filtering.
func (h *Hub) RegisterDMChannel(channelID, user1ID, user2ID int64) {
	h.dmMu.Lock()
	h.dmChans[channelID] = [2]int64{user1ID, user2ID}
	h.dmMu.Unlock()
}

// LoadDMChannels bulk-loads all DM channels (called on startup).
func (h *Hub) LoadDMChannels(channels map[int64][2]int64) {
	h.dmMu.Lock()
	h.dmChans = channels
	h.dmMu.Unlock()
}
```

- [ ] **Step 2: Update Broadcast to filter DM events**

Modify the `Broadcast` method — after the existing bot filter, add DM filtering:

```go
func (h *Hub) Broadcast(ev Event) {
	data, err := json.Marshal(ev)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	msg := string(data)

	// Check if this is a DM channel
	h.dmMu.RLock()
	dmUsers, isDM := h.dmChans[ev.ChannelID]
	h.dmMu.RUnlock()

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		// Filter: bot clients only get events from bound channels
		if c.isBot && ev.ChannelID > 0 && !c.channelIDs[ev.ChannelID] {
			continue
		}
		// Filter: DM events only go to participants
		if isDM && c.userID != dmUsers[0] && c.userID != dmUsers[1] {
			continue
		}
		if err := websocket.Message.Send(c.conn, msg); err != nil {
			log.Printf("ws: send error: %v", err)
		}
	}
}
```

- [ ] **Step 3: Run existing tests**

Run: `cd /home/dev/code/relay-chat && go test ./internal/ws/... -v`
Expected: PASS (or no tests exist — verify the build compiles)

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add internal/ws/ws.go
git commit -m "feat(ws): add DM channel filtering to WebSocket broadcast"
```

---

## Task 5: Wire DM Service in main.go

**Files:**
- Modify: `cmd/app/main.go`

- [ ] **Step 1: Add ListAll to DM service**

Add to `internal/dms/dms.go`:
```go
// ListAll returns all DM conversations (used for hub startup loading).
func (s *Service) ListAll() ([]Conversation, error) {
	rows, err := s.db.Query(`
		SELECT id, channel_id, user1_id, user2_id, created_at
		FROM dm_conversations
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.ChannelID, &c.User1ID, &c.User2ID, &c.CreatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}
```

- [ ] **Step 2: Add DM service initialization and hub wiring in main.go**

Add import:
```go
"github.com/ebrakke/relay-chat/internal/dms"
```

After `searchSvc := search.NewService(database)` (line ~93), add:
```go
dmSvc := dms.NewService(database)
```

After `hub := ws.NewHub()` and the AuthFunc/GetChannelIDsFunc setup (around line ~145), add DM channel loading:
```go
// Load DM channels into hub for broadcast filtering
if dmConvs, err := dmSvc.ListAll(); err == nil {
	dmChanMap := make(map[int64][2]int64, len(dmConvs))
	for _, dc := range dmConvs {
		dmChanMap[dc.ChannelID] = [2]int64{dc.User1ID, dc.User2ID}
	}
	hub.LoadDMChannels(dmChanMap)
}
```

Update the `api.New()` call to include `dmSvc` (we'll update the signature in Task 6).

- [ ] **Step 3: Verify build compiles**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds (may fail until Task 6 updates api.New — that's OK, commit what we have)

- [ ] **Step 4: Commit**

```bash
git add internal/dms/dms.go cmd/app/main.go
git commit -m "feat: wire DM service and load DM channels into WebSocket hub"
```

---

## Task 6: API Handlers — DM Endpoints + Access Gate

**Files:**
- Modify: `internal/api/api.go`

- [ ] **Step 1: Add DM service to Handler struct and constructor**

Add `dms` field to the Handler struct:
```go
type Handler struct {
	auth          *auth.Service
	bots          *bots.Service
	channels      *channels.Service
	calendar      *calendar.Service
	dms           *dms.Service       // add this
	messages      *messages.Service
	// ... rest unchanged
}
```

Update `New()` signature to accept `*dms.Service`:
```go
func New(authSvc *auth.Service, botSvc *bots.Service, chanSvc *channels.Service, calSvc *calendar.Service, dmSvc *dms.Service, msgSvc *messages.Service, reactSvc *reactions.Service, notifySvc *notifications.Service, fileSvc *files.Service, searchSvc *search.Service, version string, hub *ws.Hub) *Handler {
```

Set `dms: dmSvc` in the handler initialization.

Add import for `"github.com/ebrakke/relay-chat/internal/dms"`.

Update the `api.New()` call in `cmd/app/main.go` to pass `dmSvc`.

- [ ] **Step 2: Register DM routes**

Add to `routes()` after the Channels section:
```go
// Direct Messages
h.mux.HandleFunc("GET /api/dms", h.handleListDMs)
h.mux.HandleFunc("POST /api/dms", h.handleCreateDM)
h.mux.HandleFunc("GET /api/dms/{id}", h.handleGetDM)
```

- [ ] **Step 3: Write DM handler implementations**

Add after the channel handlers section in api.go:

```go
// --- DM handlers ---

func (h *Handler) handleListDMs(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	convs, err := h.dms.ListForUser(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if convs == nil {
		convs = []dms.ConversationWithUser{}
	}
	writeJSON(w, http.StatusOK, convs)
}

func (h *Handler) handleCreateDM(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		UserID int64 `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, errors.New("userId required"))
		return
	}

	// Verify target user exists and is not a bot
	targetUser, err := h.auth.GetUserByID(req.UserID)
	if err != nil {
		writeErr(w, http.StatusNotFound, errors.New("user not found"))
		return
	}
	if targetUser.IsBot {
		writeErr(w, http.StatusBadRequest, errors.New("cannot DM a bot"))
		return
	}

	conv, err := h.dms.GetOrCreate(user.ID, req.UserID)
	if err != nil {
		if errors.Is(err, dms.ErrSelfDM) {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Register in hub for WS filtering
	h.hub.RegisterDMChannel(conv.ChannelID, conv.User1ID, conv.User2ID)

	// Broadcast dm_created to the other user so their sidebar updates
	h.hub.Broadcast(ws.Event{
		Type:      "dm_created",
		Payload:   conv,
		ChannelID: conv.ChannelID,
	})

	writeJSON(w, http.StatusOK, conv)
}

func (h *Handler) handleGetDM(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	dmID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid dm id"))
		return
	}

	conv, err := h.dms.GetByID(dmID)
	if err != nil {
		if errors.Is(err, dms.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Verify participant
	if conv.User1ID != user.ID && conv.User2ID != user.ID {
		writeErr(w, http.StatusForbidden, errors.New("not a participant"))
		return
	}

	writeJSON(w, http.StatusOK, conv)
}
```

- [ ] **Step 4: Add DM access gate to channel endpoints**

Add a helper method:
```go
// checkDMAccess verifies the user is a participant if the channel is a DM.
// Returns true if access is allowed, false if denied (error already written).
func (h *Handler) checkDMAccess(w http.ResponseWriter, channelID, userID int64) bool {
	if h.dms.IsDMChannel(channelID) && !h.dms.IsParticipant(channelID, userID) {
		writeErr(w, http.StatusForbidden, errors.New("not a participant in this conversation"))
		return false
	}
	return true
}
```

Add the DM access check to `handleListMessages`, `handleCreateMessage`, and `handleMarkRead` — right after the channel ID is parsed and before the business logic. For example, in `handleListMessages`:

```go
func (h *Handler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)  // changed from _ to user
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	channelID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid channel id"))
		return
	}

	// DM access gate
	if !h.checkDMAccess(w, channelID, user.ID) {
		return
	}
	// ... rest unchanged
```

Do the same for `handleCreateMessage` (already has `user`) and `handleMarkRead`.

For message-level routes (`handleEditMessage`, `handleDeleteMessage`, `handleListThread`, `handleCreateReply`, `handleAddReaction`, `handleRemoveReaction`): these use `/api/messages/{id}` paths. Add a check after fetching the message — verify that if the message's channel is a DM, the user is a participant. The edit/delete handlers already enforce ownership (`msg.UserID != userID`), so the main concern is read-adjacent routes like `handleListThread`. Add the check to `handleListThread` and `handleCreateReply`.

**Important:** `handleListThread` currently discards the user with `_, err := h.requireAuth(r)`. Change this to `user, err := h.requireAuth(r)` so we have the user ID for the DM access check. Then after the parent ID is parsed, fetch the parent and check:

```go
// In handleListThread:
user, err := h.requireAuth(r)  // was: _, err := h.requireAuth(r)
// ... parse parentID ...

// DM access gate: fetch parent to get channel ID
parent, err := h.messages.GetByID(parentID)
if err != nil {
	writeErr(w, http.StatusNotFound, errors.New("thread not found"))
	return
}
if !h.checkDMAccess(w, parent.ChannelID, user.ID) {
	return
}
```

Do the same for `handleAddReaction` and `handleRemoveReaction` — change `_` to `user` in the auth call, fetch the message to get its channel ID, and call `checkDMAccess`.

- [ ] **Step 5: Add DM-aware notifications**

Three changes needed:

**A) Suppress default notifications for DM channels in `cmd/app/main.go`.**

The `notifyFunc` on the message service fires inside `messages.Create()` and sends to all users. For DMs, we handle notifications separately. Update the callback in `main.go`:

```go
msgSvc.SetNotifyFunc(func(msg *messages.Message, channelName string) {
	// Skip DM channels — DM notifications are handled separately in the API handler
	if dmSvc.IsDMChannel(msg.ChannelID) {
		return
	}
	if err := notifySvc.Send(msg, channelName); err != nil {
		log.Printf("Notification error: %v", err)
	}
})
```

**B) Add `SendDM` method to `internal/notifications/notifications.go`.**

The existing `sendToUser` takes `(userID, msg, channelName)` and calls `buildPayload` internally. For DMs we need a different payload (title = sender name, URL = `/dms/{conversationID}`). Add a new method:

```go
// SendDM sends a DM notification to the recipient.
func (s *Service) SendDM(msg *messages.Message, senderName string, recipientID int64, conversationID int64) {
	level := s.GetChannelNotificationLevel(recipientID, msg.ChannelID)
	if level == "nothing" {
		return
	}

	baseURL := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		baseURL = configuredURL
	}

	content := msg.Content
	if len(content) > 500 {
		content = content[:500] + "..."
	}

	payload := Payload{
		Title:     senderName,
		Message:   content,
		Sender:    senderName,
		ChannelID: msg.ChannelID,
		URL:       fmt.Sprintf("%s/dms/%d", baseURL, conversationID),
		Timestamp: msg.CreatedAt,
	}

	// Try web push first
	subs, _ := s.GetWebPushSubscriptions(recipientID)
	if len(subs) > 0 {
		log.Printf("Sending DM web push to user %d (%d subscriptions)", recipientID, len(subs))
		s.SendWebPush(subs, payload)
		return
	}

	// Fall back to webhook provider (same pattern as sendToUser)
	settings, err := s.GetSettings(recipientID)
	if err != nil || settings == nil || settings.Provider == "" {
		return
	}
	provider, ok := s.providers[settings.Provider]
	if !ok {
		return
	}

	var providerConfig map[string]string
	json.Unmarshal([]byte(settings.ProviderConfig), &providerConfig)

	recipient := Recipient{
		UserID:      recipientID,
		ProviderKey: providerConfig["key"],
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := provider.Send(ctx, recipient, payload); err != nil {
		log.Printf("DM notification send error (user %d, provider %s): %v", recipientID, settings.Provider, err)
	}
}
```

**C) Call `SendDM` in `handleCreateMessage` in `internal/api/api.go`.**

Add after the `h.hub.Broadcast(...)` line in `handleCreateMessage`:
```go
// For DM channels, send notification only to the other participant
if h.dms.IsDMChannel(channelID) {
	conv, err := h.dms.GetByChannelID(channelID)
	if err == nil {
		otherUserID, err := h.dms.GetOtherUserID(channelID, user.ID)
		if err == nil {
			go h.notifications.SendDM(msg, user.DisplayName, otherUserID, conv.ID)
		}
	}
}
```

- [ ] **Step 6: Verify build**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds

Run: `cd /home/dev/code/relay-chat && go test ./... -count=1`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add internal/api/api.go internal/notifications/notifications.go cmd/app/main.go
git commit -m "feat(api): add DM endpoints, access gate, and DM-specific notifications"
```

---

## Task 7: Frontend Types + DM Store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/stores/dms.svelte.ts`

- [ ] **Step 1: Add DMConversation type**

Add to `frontend/src/lib/types.ts`:
```typescript
export interface DMConversation {
  id: number;
  channelId: number;
  user1Id: number;
  user2Id: number;
  createdAt: string;
  otherUserId: number;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl?: string;
  lastMessageContent?: string;
  lastMessageAt?: string;
  lastMessageSenderName?: string;
  unreadCount: number;
}
```

- [ ] **Step 2: Create DM store**

```typescript
// frontend/src/lib/stores/dms.svelte.ts
import { api } from '$lib/api';
import type { DMConversation } from '$lib/types';

class DMStore {
  conversations = $state<DMConversation[]>([]);
  activeConversationId = $state<number | null>(null);

  get activeConversation(): DMConversation | undefined {
    return this.conversations.find((c) => c.id === this.activeConversationId);
  }

  async load() {
    this.conversations = await api<DMConversation[]>('GET', '/api/dms');
  }

  setActive(id: number | null) {
    this.activeConversationId = id;
  }

  async startDM(userId: number): Promise<DMConversation> {
    const conv = await api<DMConversation>('POST', '/api/dms', { userId });
    // Reload full list to get enriched data (last message, unread, etc.)
    await this.load();
    const enriched = this.conversations.find((c) => c.id === conv.id);
    return enriched ?? conv;
  }

  getByChannelId(channelId: number): DMConversation | undefined {
    return this.conversations.find((c) => c.channelId === channelId);
  }

  addConversation(conv: DMConversation) {
    if (!this.conversations.find((c) => c.id === conv.id)) {
      this.conversations = [conv, ...this.conversations];
    }
  }

  updateUnread(channelId: number, increment: number) {
    this.conversations = this.conversations.map((c) => {
      if (c.channelId !== channelId) return c;
      return { ...c, unreadCount: (c.unreadCount || 0) + increment };
    });
  }

  updateLastMessage(channelId: number, content: string, senderName: string, timestamp: string) {
    this.conversations = this.conversations.map((c) => {
      if (c.channelId !== channelId) return c;
      return {
        ...c,
        lastMessageContent: content.length > 100 ? content.slice(0, 100) + '...' : content,
        lastMessageAt: timestamp,
        lastMessageSenderName: senderName
      };
    });
    // Re-sort by most recent
    this.conversations = [...this.conversations].sort((a, b) => {
      const aTime = a.lastMessageAt || a.createdAt;
      const bTime = b.lastMessageAt || b.createdAt;
      return bTime.localeCompare(aTime);
    });
  }

  markRead(channelId: number) {
    this.conversations = this.conversations.map((c) =>
      c.channelId === channelId ? { ...c, unreadCount: 0 } : c
    );
  }

  get totalUnread(): number {
    return this.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }
}

export const dmStore = new DMStore();
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/stores/dms.svelte.ts
git commit -m "feat(frontend): add DMConversation type and DM store"
```

---

## Task 8: WebSocket DM Event Handling

**Files:**
- Modify: `frontend/src/lib/ws.svelte.ts`

- [ ] **Step 1: Add DM imports and event handlers**

Add import at top of file:
```typescript
import { dmStore } from './stores/dms.svelte';
```

Modify existing event handlers and add new ones. **Do not add duplicate cases — replace existing ones.**

**Replace** the existing `case 'new_message'` block (lines ~68-75) with:

```typescript
case 'new_message':
  if (payload) {
    messageStore.addMessage(payload);
    const dmConv = dmStore.getByChannelId(payload.channelId);
    if (dmConv) {
      dmStore.updateLastMessage(
        payload.channelId,
        payload.content,
        payload.displayName,
        payload.createdAt
      );
      if (dmStore.activeConversationId !== dmConv.id) {
        dmStore.updateUnread(payload.channelId, 1);
      }
    } else if (payload.channelId !== channelStore.activeChannelId) {
      channelStore.updateUnread(payload.channelId, 1, false);
    }
  }
  break;
```

Also update the existing `case 'new_reply'` block to handle DM thread replies. After the existing `threadStore.addReply(payload)` line, add DM unread tracking:

```typescript
case 'new_reply':
  if (payload) {
    messageStore.incrementReplyCount(payload.parentId);
    messageStore.addReplyParticipant(payload.parentId, {
      userId: payload.userId,
      username: payload.username,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl
    });
    threadStore.addReply(payload);
    // Update DM sidebar for thread replies
    const dmConvReply = dmStore.getByChannelId(payload.channelId);
    if (dmConvReply && dmStore.activeConversationId !== dmConvReply.id) {
      dmStore.updateUnread(payload.channelId, 1);
    }
  }
  break;
```

Add the `dm_created` case after `channel_created`:

```typescript
case 'dm_created':
  if (payload) {
    dmStore.load();
  }
  break;
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/ws.svelte.ts
git commit -m "feat(frontend): handle DM events in WebSocket manager"
```

---

## Task 9: Sidebar — DM Section

**Files:**
- Modify: `frontend/src/lib/components/Sidebar.svelte`
- Create: `frontend/src/lib/components/UserPicker.svelte`

- [ ] **Step 1: Create UserPicker component**

```svelte
<!-- frontend/src/lib/components/UserPicker.svelte -->
<script lang="ts">
  import { api } from '$lib/api';
  import { dmStore } from '$lib/stores/dms.svelte';
  import { goto } from '$app/navigation';
  import type { User } from '$lib/types';
  import { authStore } from '$lib/stores/auth';

  let { onClose }: { onClose: () => void } = $props();

  let query = $state('');
  let results = $state<User[]>([]);
  let searching = $state(false);
  let starting = $state(false);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 1) {
      results = [];
      return;
    }
    searching = true;
    try {
      const users = await api<User[]>('GET', `/api/users/search?q=${encodeURIComponent(q)}`);
      // Filter out current user and bots
      results = users.filter((u) => u.id !== authStore.user?.id && !u.isBot);
    } catch {
      results = [];
    }
    searching = false;
  }

  async function selectUser(user: User) {
    starting = true;
    try {
      const conv = await dmStore.startDM(user.id);
      onClose();
      goto(`/dms/${conv.id}`);
    } catch {
      // toast error
    }
    starting = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
  role="dialog"
  aria-modal="true"
  aria-label="New direct message"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="p-6 w-full max-w-md mx-4 border" style="background: var(--background); border-color: var(--border);">
    <h2 class="text-[14px] font-bold mb-4" style="color: var(--foreground);">New Direct Message</h2>

    <input
      type="text"
      bind:value={query}
      oninput={handleSearch}
      placeholder="Search users..."
      class="w-full px-3 py-2 text-[13px] border outline-none mb-3"
      style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
    />

    <ul class="max-h-60 overflow-y-auto">
      {#each results as user (user.id)}
        <li>
          <button
            onclick={() => selectUser(user)}
            disabled={starting}
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80"
            style="color: var(--foreground);"
          >
            {#if user.avatarUrl}
              <img src={user.avatarUrl} alt="" class="w-6 h-6 rounded-full object-cover" />
            {:else}
              <span
                class="inline-flex items-center justify-center w-6 h-6 text-[11px] border shrink-0"
                style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);"
              >{user.displayName.charAt(0).toUpperCase()}</span>
            {/if}
            <div class="flex flex-col leading-tight min-w-0">
              <span class="text-[13px] truncate">{user.displayName}</span>
              <span class="text-[10px] truncate" style="color: var(--rc-timestamp);">@{user.username}</span>
            </div>
          </button>
        </li>
      {/each}
      {#if query.trim() && results.length === 0 && !searching}
        <li class="px-3 py-2 text-[12px]" style="color: var(--rc-timestamp);">No users found</li>
      {/if}
    </ul>

    <div class="flex justify-end mt-3">
      <button
        onclick={onClose}
        class="px-3 py-1.5 text-[12px] hover:underline"
        style="color: var(--rc-timestamp);"
      >Cancel</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add DM section to Sidebar**

In `frontend/src/lib/components/Sidebar.svelte`:

Add imports at top of `<script>`:
```typescript
import { dmStore } from '$lib/stores/dms.svelte';
import UserPicker from './UserPicker.svelte';
```

Add state for the user picker modal:
```typescript
let showDMPicker = $state(false);
```

Add navigation helper:
```typescript
function navigateToDM(id: number) {
  goto(`/dms/${id}`);
  onCloseSidebar?.();
}
```

In the template, after the closing `</ul>` of the channel list (line ~131) and before the `</nav>` closing tag, add:

```svelte
<!-- Direct Messages -->
<div class="flex items-center justify-between px-4 pb-1 pt-4">
  <span
    class="text-[10px] uppercase tracking-[0.12em]"
    style="color: var(--rc-timestamp);"
  >direct messages</span>
  <button
    onclick={() => showDMPicker = true}
    class="text-[16px] leading-none hover:opacity-70 p-1"
    style="color: var(--rc-timestamp);"
    title="New direct message"
  >+</button>
</div>

<ul class="dm-list">
  {#each dmStore.conversations as conv (conv.id)}
    {@const active = dmStore.activeConversationId === conv.id}
    <li>
      <button
        onclick={() => navigateToDM(conv.id)}
        class="w-full flex items-center gap-1.5 px-4 py-2 text-[13px] text-left"
        style="background: {active ? 'var(--rc-channel-active-bg)' : 'transparent'}; color: {active ? 'var(--rc-channel-active-fg)' : 'var(--foreground)'};"
        aria-current={active ? 'page' : undefined}
      >
        {#if conv.otherAvatarUrl}
          <img src={conv.otherAvatarUrl} alt="" class="w-4 h-4 rounded-full object-cover shrink-0" />
        {:else}
          <span
            class="inline-flex items-center justify-center w-4 h-4 text-[9px] shrink-0"
            style="background: var(--rc-channel-active-bg); color: {active ? 'var(--rc-channel-active-fg)' : 'var(--rc-timestamp)'};"
          >{conv.otherDisplayName.charAt(0).toUpperCase()}</span>
        {/if}
        <span class="flex-1 truncate">{conv.otherDisplayName}</span>
        {#if conv.unreadCount}
          <span
            class="text-[11px] tabular-nums ml-auto"
            style="color: var(--rc-olive);"
          >{conv.unreadCount}</span>
        {/if}
      </button>
    </li>
  {/each}
</ul>
```

At the bottom of the file, after the Create Channel Modal, add:
```svelte
{#if showDMPicker}
  <UserPicker onClose={() => showDMPicker = false} />
{/if}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components/UserPicker.svelte frontend/src/lib/components/Sidebar.svelte
git commit -m "feat(frontend): add DM sidebar section with user picker"
```

---

## Task 10: DM Conversation Page

**Files:**
- Create: `frontend/src/routes/(app)/dms/[id]/+page.svelte`

- [ ] **Step 1: Create the DM conversation page**

```svelte
<!-- frontend/src/routes/(app)/dms/[id]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { dmStore } from '$lib/stores/dms.svelte';
  import { messageStore } from '$lib/stores/messages';
  import { channelStore } from '$lib/stores/channels';
  import { threadStore } from '$lib/stores/threads';
  import { uploadFile } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import MessageInput from '$lib/components/MessageInput.svelte';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import ProfilePanel from '$lib/components/ProfilePanel.svelte';

  let dmId = $derived(Number($page.params.id));
  let conversation = $derived(dmStore.conversations.find((c) => c.id === dmId));
  let channelId = $derived(conversation?.channelId ?? 0);
  let messages = $derived(channelId ? messageStore.getMessages(channelId) : []);
  let threadOpen = $derived(threadStore.openThreadId !== null);

  let loaded = $state(false);
  let lastMarkedMsgId = $state(0);

  interface ProfileData {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
    userCreatedAt?: string;
    isBot?: boolean;
  }

  let profileOpen = $state<ProfileData | null>(null);

  let rightPanel = $derived<'thread' | 'profile' | null>(
    profileOpen ? 'profile' : threadOpen ? 'thread' : null
  );

  async function loadMessages(id: number) {
    loaded = false;
    try {
      await messageStore.loadChannel(id);
    } catch {
      toastStore.error('Failed to load messages');
    }
    loaded = true;
  }

  // Set active DM and load messages when conversation changes
  $effect(() => {
    if (dmId) {
      // Clear active channel so sidebar doesn't highlight a channel
      channelStore.setActive(0);
      dmStore.setActive(dmId);
    }
  });

  $effect(() => {
    if (channelId) {
      loadMessages(channelId);
    }
  });

  // Sync thread state with URL query param
  $effect(() => {
    const threadParam = $page.url.searchParams.get('thread');
    const parentId = threadParam ? Number(threadParam) : null;
    const isLoaded = loaded;

    untrack(() => {
      if (parentId && isLoaded && parentId !== threadStore.openThreadId) {
        const parentMsg = messageStore.getMessages(channelId).find((m) => m.id === parentId);
        threadStore.openThread(parentId, parentMsg);
      } else if (!parentId && threadStore.openThreadId !== null) {
        threadStore.closeThread();
      }
    });
  });

  // Mark DM as read when messages load or new ones arrive
  $effect(() => {
    const id = channelId;
    const msgs = messages;
    const isLoaded = loaded;
    untrack(() => {
      if (isLoaded && msgs.length > 0 && id) {
        const lastMessage = msgs[msgs.length - 1];
        if (lastMessage.id !== lastMarkedMsgId) {
          lastMarkedMsgId = lastMessage.id;
          // Use existing channel mark-read endpoint (DM channels reuse it)
          channelStore.markRead(id, lastMessage.id);
          dmStore.markRead(id);
        }
      }
    });
  });

  async function handleSend(content: string, files?: File[]) {
    try {
      const msgContent = content || (files?.length ? files.map(f => f.name).join(', ') : '');
      if (msgContent) {
        await messageStore.send(channelId, msgContent);
      }
      if (files?.length) {
        await messageStore.loadChannel(channelId);
        const msgs = messageStore.getMessages(channelId);
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) {
          for (const f of files) {
            await uploadFile(f, lastMsg.id);
          }
        }
      }
      await messageStore.loadChannel(channelId);
    } catch {
      toastStore.error('Failed to send message');
    }
  }

  function openThread(parentId: number) {
    goto(`/dms/${dmId}?thread=${parentId}`);
  }

  function closeThread() {
    goto(`/dms/${dmId}`);
  }

  function openProfile(profile: ProfileData) {
    profileOpen = profile;
  }

  function closeProfile() {
    profileOpen = null;
  }
</script>

<div class="channel-view flex h-full min-h-0">
  <!-- Messages area -->
  <div class="main-panel flex flex-col flex-1 min-w-0 min-h-0 {rightPanel ? 'hidden md:flex' : 'flex'}">
    <!-- DM header -->
    <div
      class="channel-header flex items-center gap-3 px-4 py-3 border-b shrink-0"
      style="border-color: var(--border);"
    >
      {#if conversation}
        {#if conversation.otherAvatarUrl}
          <img src={conversation.otherAvatarUrl} alt="" class="w-5 h-5 rounded-full object-cover" />
        {:else}
          <span
            class="inline-flex items-center justify-center w-5 h-5 text-[11px] border shrink-0"
            style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);"
          >{conversation.otherDisplayName.charAt(0).toUpperCase()}</span>
        {/if}
        <span class="text-[13px] font-bold" style="color: var(--foreground);">
          {conversation.otherDisplayName}
        </span>
      {:else}
        <span class="text-[13px] font-bold" style="color: var(--foreground);">Loading...</span>
      {/if}
    </div>

    <!-- Messages -->
    {#if !loaded}
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[12px] font-mono" style="color: var(--rc-timestamp);">loading...</span>
      </div>
    {:else}
      <MessageList {messages} onOpenThread={openThread} onOpenProfile={openProfile} />
    {/if}

    <!-- Input -->
    <MessageInput
      onSend={handleSend}
      placeholder={conversation ? `message ${conversation.otherDisplayName}` : 'type a message...'}
    />
  </div>

  <!-- Thread panel -->
  {#if rightPanel === 'thread'}
    <ThreadPanel onClose={closeThread} />
  {/if}

  <!-- Profile panel -->
  {#if rightPanel === 'profile' && profileOpen}
    <ProfilePanel
      displayName={profileOpen.displayName}
      username={profileOpen.username}
      avatarUrl={profileOpen.avatarUrl}
      role={profileOpen.role}
      userCreatedAt={profileOpen.userCreatedAt}
      isBot={profileOpen.isBot}
      onClose={closeProfile}
    />
  {/if}
</div>
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/(app)/dms/[id]/+page.svelte
git commit -m "feat(frontend): add DM conversation page"
```

---

## Task 11: Load DM Store on App Mount + Profile Panel Message Button

**Files:**
- Modify: `frontend/src/routes/(app)/+layout.svelte`
- Modify: `frontend/src/lib/components/ProfilePanel.svelte`

- [ ] **Step 1: Load DM store in app layout**

In `frontend/src/routes/(app)/+layout.svelte`, add import:
```typescript
import { dmStore } from '$lib/stores/dms.svelte';
```

In the `onMount` callback, after `channelStore.load()`, add:
```typescript
dmStore.load();
```

- [ ] **Step 2: Thread userId through the profile system and add "Message" button**

This requires changes to 4 files — the profile type needs `userId`, components need to pass it, and ProfilePanel needs a "Message" button.

**A) Add `userId` to the `onOpenProfile` callback type in `Message.svelte`.**

The `handleProfileClick` function in `Message.svelte` (line ~228) already has access to `message.userId`. Add it to the profile data object:

```typescript
// Message.svelte - handleProfileClick
onOpenProfile?.({
  userId: message.userId,  // ADD THIS LINE
  displayName: message.displayName,
  username: message.username,
  avatarUrl: message.avatarUrl,
  role: message.role,
  userCreatedAt: message.userCreatedAt,
  isBot: message.isBot
});
```

Update the `onOpenProfile` type signature in `Message.svelte` and `MessageList.svelte` to include `userId?: number`.

Do the same in `MembersPanel.svelte`'s `handleMemberClick` — add `userId: m.id` (the member ID) and update the type.

**B) Extend ProfileData in channel page (`channels/[id]/+page.svelte`) and DM page (`dms/[id]/+page.svelte`).**

```typescript
interface ProfileData {
  userId?: number;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  role?: string;
  userCreatedAt?: string;
  isBot?: boolean;
}
```

**C) Add `onMessage` callback prop to `ProfilePanel.svelte`.**

```typescript
let { displayName, username, avatarUrl, role, userCreatedAt, isBot, onClose, onMessage }:
  { displayName: string; username?: string; avatarUrl?: string; role?: string; userCreatedAt?: string; isBot?: boolean; onClose: () => void; onMessage?: () => void } = $props();
```

Add a "Message" button in the panel (only shown if `onMessage` is provided):
```svelte
{#if onMessage}
  <button
    onclick={onMessage}
    class="w-full px-3 py-1.5 text-[12px] border font-mono mt-3"
    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
  >Message</button>
{/if}
```

**D) Pass `onMessage` from channel page and DM page to ProfilePanel.**

In both pages, when rendering ProfilePanel:
```svelte
{#if rightPanel === 'profile' && profileOpen}
  <ProfilePanel
    displayName={profileOpen.displayName}
    username={profileOpen.username}
    avatarUrl={profileOpen.avatarUrl}
    role={profileOpen.role}
    userCreatedAt={profileOpen.userCreatedAt}
    isBot={profileOpen.isBot}
    onClose={closeProfile}
    onMessage={profileOpen.userId && profileOpen.userId !== authStore.user?.id ? async () => {
      const conv = await dmStore.startDM(profileOpen!.userId!);
      closeProfile();
      goto(`/dms/${conv.id}`);
    } : undefined}
  />
{/if}
```

Add imports for `dmStore` and `authStore` to both pages if not already present.

- [ ] **Step 3: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/(app)/+layout.svelte frontend/src/lib/components/ProfilePanel.svelte frontend/src/routes/(app)/channels/[id]/+page.svelte frontend/src/routes/(app)/dms/[id]/+page.svelte
git commit -m "feat(frontend): load DM store on mount, add Message button to profiles"
```

---

## Task 12: Clear DM Active State on Channel Navigation

**Files:**
- Modify: `frontend/src/routes/(app)/channels/[id]/+page.svelte`

- [ ] **Step 1: Clear DM active state when entering a channel**

In the channel page's `$effect` that sets the active channel, also clear the DM active state:

Add import:
```typescript
import { dmStore } from '$lib/stores/dms.svelte';
```

In the effect that calls `channelStore.setActive(channelId)`, add:
```typescript
dmStore.setActive(null);
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /home/dev/code/relay-chat/frontend && bun run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/(app)/channels/[id]/+page.svelte
git commit -m "feat(frontend): clear DM active state when navigating to channels"
```

---

## Task 13: Integration Test — Full Build + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run full Go test suite**

Run: `cd /home/dev/code/relay-chat && go test ./... -count=1`
Expected: All tests pass

- [ ] **Step 2: Build frontend**

Run: `cd /home/dev/code/relay-chat/frontend && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Full build**

Run: `cd /home/dev/code/relay-chat && make build`
Expected: Binary builds successfully

- [ ] **Step 4: Smoke test**

Run: `cd /home/dev/code/relay-chat && make dev`

Manual verification:
1. Log in as admin
2. Create a second user via invite
3. Open the sidebar — "Direct Messages" section should appear
4. Click "+" to open user picker, search for the other user
5. Select them — DM conversation page opens
6. Send a message — appears in real time
7. Switch to a channel — DM shows in sidebar with unread badge
8. Click back to DM — messages load, unread clears
9. Verify channel list does NOT show DM backing channels

- [ ] **Step 5: Run E2E tests if they exist**

Run: `cd /home/dev/code/relay-chat && make test-e2e`
Expected: Existing E2E tests still pass (DMs are additive, shouldn't break anything)
