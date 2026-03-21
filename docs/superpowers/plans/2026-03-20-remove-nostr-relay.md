# Remove Nostr/Relay Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Nostr (NIP-29) relay infrastructure, leaving the app as a pure REST/WebSocket chat system.

**Architecture:** Delete the relay package, event-signing code in messages/reactions, and the `/relay` endpoint. Add a migration to drop `event_id` columns. Clean up dependencies. Frontend is untouched.

**Tech Stack:** Go, SQLite (modernc.org/sqlite), no cgo

**Spec:** `docs/superpowers/specs/2026-03-20-remove-nostr-relay-design.md`

---

### Task 1: Remove Nostr event creation from message service

**Files:**
- Modify: `internal/messages/messages.go`

- [ ] **Step 1: Remove `EventID` field from `Message` struct**

Delete line 33:
```go
EventID      string        `json:"eventId,omitempty"`
```

- [ ] **Step 2: Remove `relayPriv` field and `SetRelayKey` method**

Delete `relayPriv` field from `Service` struct (line 66) and the `SetRelayKey` method (lines 74-77). The struct becomes:
```go
type Service struct {
	db         *db.DB
	notifyFunc func(*Message, string) // callback for notifications
}
```

- [ ] **Step 3: Remove `groupID` parameter from `Create` and update body**

Change signature from:
```go
func (s *Service) Create(channelID, userID int64, content, groupID string) (*Message, error) {
```
to:
```go
func (s *Service) Create(channelID, userID int64, content string) (*Message, error) {
```

Remove the `createEvent` call and `eventID` variable (lines 86-89). Update the INSERT to remove `event_id`:
```go
res, err := s.db.Exec(
    "INSERT INTO messages (channel_id, user_id, content, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    channelID, userID, content, mentionsJSON, previewsJSON, now,
)
```

- [ ] **Step 4: Remove `groupID` parameter from `CreateReply` and update body**

Change signature from:
```go
func (s *Service) CreateReply(parentID, userID int64, content string, groupID string) (*Message, error) {
```
to:
```go
func (s *Service) CreateReply(parentID, userID int64, content string) (*Message, error) {
```

Remove the `parentEventID` lookup (line 140), the `createEvent` call and `eventID` variable (lines 142-145). Update the INSERT to remove `event_id`:
```go
res, err := s.db.Exec(
    "INSERT INTO messages (channel_id, user_id, parent_id, content, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    parent.ChannelID, userID, parentID, content, mentionsJSON, previewsJSON, now,
)
```

- [ ] **Step 5: Remove `event_id` from all SELECT queries and scan targets**

In `GetByID` (lines 185-233):
- Remove `m.event_id` from the SELECT (line 195)
- Remove `var eventID sql.NullString` (line 188)
- Remove `eventID` from the `.Scan()` call (line 202)
- Remove the `if eventID.Valid` block (lines 220-222)

In `ListChannel` (lines 286-380) — both query branches:
- Remove `m.event_id` from both SELECTs (lines 297, 308)
- Remove `var eventID sql.NullString` (line 326)
- Remove `eventID` from the `.Scan()` call (line 332)
- Remove the `if eventID.Valid` block (lines 343-345)

In `ListThread` (lines 382-455) — both query branches:
- Remove `m.event_id` from both SELECTs (lines 392, 402)
- Remove `var eventID sql.NullString` (line 420)
- Remove `eventID` from the `.Scan()` call (line 426)
- Remove the `if eventID.Valid` block (lines 440-442)

- [ ] **Step 6: Delete `createEvent` and `randomHex` functions**

Delete `createEvent` (lines 588-623) and `randomHex` (lines 669-673).

- [ ] **Step 7: Clean up imports**

Remove these imports that are no longer needed:
```go
"crypto/rand"
"encoding/hex"
"github.com/nbd-wtf/go-nostr"
```

Keep: `"time"` is still used elsewhere.

- [ ] **Step 8: Verify the file compiles**

Run: `cd /home/dev/code/relay-chat && go build ./internal/messages/`
Expected: compilation error about call sites (api.go still passes groupID) — that's OK, we fix those in Task 4.

---

### Task 2: Remove Nostr event creation from reaction service

**Files:**
- Modify: `internal/reactions/reactions.go`

- [ ] **Step 1: Remove `EventID` field from `Reaction` struct**

Delete line 38:
```go
EventID     string `json:"eventId,omitempty"`
```

- [ ] **Step 2: Remove `relayPriv` field and `SetRelayKey` method**

Delete `relayPriv` field from `Service` struct (line 55) and the `SetRelayKey` method (lines 63-66). The struct becomes:
```go
type Service struct {
	db *db.DB
}
```

- [ ] **Step 3: Remove `groupID` from `Toggle` and update body**

Change signature from:
```go
func (s *Service) Toggle(messageID, userID int64, emoji, groupID string) (*Reaction, bool, error) {
```
to:
```go
func (s *Service) Toggle(messageID, userID int64, emoji string) (*Reaction, bool, error) {
```

Remove the `createEvent` call and `eventID` variable (lines 95-98). Update the INSERT to remove `event_id`:
```go
now := time.Now().UTC().Format(time.RFC3339)
res, err := s.db.Exec(
    "INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
    messageID, userID, emoji, now,
)
```

- [ ] **Step 4: Remove `groupID` from `Add` and update body**

Change signature from:
```go
func (s *Service) Add(messageID, userID int64, emoji, groupID string) (*Reaction, error) {
```
to:
```go
func (s *Service) Add(messageID, userID int64, emoji string) (*Reaction, error) {
```

Remove the `createEvent` call and `eventID` variable (lines 136-139). Update the INSERT to remove `event_id`:
```go
now := time.Now().UTC().Format(time.RFC3339)
res, err := s.db.Exec(
    "INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
    messageID, userID, emoji, now,
)
```

- [ ] **Step 5: Remove `event_id` from `getByID` query**

In `getByID` (lines 252-273):
- Remove `r.event_id` from the SELECT (line 256)
- Remove `var eventID sql.NullString` (line 254)
- Remove `eventID` from the `.Scan()` call (line 261)
- Remove the `if eventID.Valid` block (lines 269-271)

- [ ] **Step 6: Delete `createEvent` function**

Delete `createEvent` (lines 275-310).

- [ ] **Step 7: Clean up imports**

Remove these imports:
```go
"github.com/nbd-wtf/go-nostr"
```

Keep `"database/sql"` — it is still used for `sql.ErrNoRows` in `Toggle` and `Add`.

- [ ] **Step 8: Verify the file compiles**

Run: `cd /home/dev/code/relay-chat && go build ./internal/reactions/`
Expected: compilation error about call sites — fixed in Task 4.

---

### Task 3: Delete relay packages and remove wiring

**Files:**
- Delete: `internal/relay/relay.go`
- Delete: `relay/` directory (entire)
- Modify: `cmd/app/main.go`

- [ ] **Step 1: Delete `internal/relay/` directory**

```bash
rm -rf /home/dev/code/relay-chat/internal/relay/
```

- [ ] **Step 2: Delete `relay/` directory**

```bash
rm -rf /home/dev/code/relay-chat/relay/
```

- [ ] **Step 3: Remove relay import from main.go**

Delete line 30:
```go
internalrelay "github.com/ebrakke/relay-chat/internal/relay"
```

- [ ] **Step 4: Remove `relayDBPath` variable**

Delete from line 59:
```go
relayDBPath := envOr("RELAY_DATABASE_PATH", filepath.Join(dataDir(), "relay.db"))
```

- [ ] **Step 5: Remove relay initialization block**

Delete lines 129-136:
```go
// Create NIP-29 relay handler
relayHandler, err := internalrelay.New(internalrelay.Config{
    DatabasePath: relayDBPath,
})
if err != nil {
    log.Fatalf("Failed to initialize relay: %v", err)
}
defer relayHandler.Close()
```

- [ ] **Step 6: Remove relay sync from pre-backup handler**

In the `/-/pre-backup` handler, delete lines 186-190:
```go
if err := relayHandler.Sync(); err != nil {
    log.Printf("pre-backup: Badger sync failed: %v", err)
    http.Error(w, "sync failed", http.StatusInternalServerError)
    return
}
```

- [ ] **Step 7: Remove `/relay` mux routes**

Delete lines 198-200:
```go
// /relay -> NIP-29 relay (websocket)
mux.Handle("/relay", relayHandler)
mux.Handle("/relay/", relayHandler)
```

- [ ] **Step 8: Update Dockerfile.once**

Delete line 27 (`COPY relay/ ./relay/`).

Update line 32 comment from `# build binary (cgo enabled for go-sqlite3)` to `# build binary`. Also change `CGO_ENABLED=1` to `CGO_ENABLED=0` on line 33 since we no longer need cgo (mattn/go-sqlite3 is removed; we use pure-Go modernc.org/sqlite). Remove `build-base` from the apk add line (line 15) since it's only needed for cgo.

- [ ] **Step 9: Update deploy/once/hooks/post-restore**

Remove line 3 (`rm -f /storage/relay/LOCK`) since Badger is no longer used. The file becomes:
```sh
#!/bin/sh
rm -f /storage/app.db-wal /storage/app.db-shm
```

- [ ] **Step 10: Verify main.go compiles (ignoring downstream errors)**

Run: `cd /home/dev/code/relay-chat && go vet ./cmd/app/`
Expected: may still fail on messages/reactions signature changes — fixed next.

---

### Task 4: Update API call sites (remove groupID plumbing)

**Files:**
- Modify: `internal/api/api.go`

- [ ] **Step 1: Update `handleCreateMessage` — remove channel lookup for groupID**

At line 668, the comment says `// Verify channel exists and get name for group ID`. The channel lookup is still useful to verify the channel exists, but we no longer need `ch.Name`. Change line 687 from:
```go
msg, err := h.messages.Create(channelID, user.ID, req.Content, ch.Name)
```
to:
```go
msg, err := h.messages.Create(channelID, user.ID, req.Content)
```

Update the comment on line 668 from `// Verify channel exists and get name for group ID` to `// Verify channel exists`.

- [ ] **Step 2: Update `handleCreateReply` — remove channel lookup for groupID**

At line 759, remove the channel lookup block (lines 759-763) since `ch` is only used for `ch.Name`:
```go
ch, err := h.channels.GetByID(parent.ChannelID)
if err != nil {
    writeErr(w, http.StatusInternalServerError, err)
    return
}
```

Update the comment on line 743 from `// Look up parent to get channel name for group ID` to remove it (or keep as `// Look up parent to get channel ID`... actually the parent lookup at line 744 still exists and is needed for bot permission check and channelID).

Change line 777 from:
```go
msg, err := h.messages.CreateReply(parentID, user.ID, req.Content, ch.Name)
```
to:
```go
msg, err := h.messages.CreateReply(parentID, user.ID, req.Content)
```

- [ ] **Step 3: Update `handleAddReaction` — remove channel lookup for groupID**

Remove the channel lookup block (lines 940-944) since `ch` is only used for `ch.Name`:
```go
ch, err := h.channels.GetByID(msg.ChannelID)
if err != nil {
    writeErr(w, http.StatusInternalServerError, err)
    return
}
```

Change line 946 from:
```go
reaction, err := h.reactions.Add(messageID, user.ID, req.Emoji, ch.Name)
```
to:
```go
reaction, err := h.reactions.Add(messageID, user.ID, req.Emoji)
```

- [ ] **Step 4: Verify everything compiles**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: PASS (compiles clean)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove Nostr/relay architecture

Remove NIP-29 relay handler, event signing from messages/reactions,
relay wiring from main, and groupID plumbing from API handlers."
```

---

### Task 5: Add migration to drop event_id columns

**Files:**
- Create: `internal/db/migrations/023_drop_event_ids.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Drop Nostr event ID columns (no longer used after relay removal)
DROP INDEX IF EXISTS idx_messages_event_id;
ALTER TABLE messages DROP COLUMN event_id;
ALTER TABLE reactions DROP COLUMN event_id;
```

- [ ] **Step 2: Verify migration runs**

Run: `cd /home/dev/code/relay-chat && go test ./internal/db/ -v -run TestMigrations 2>/dev/null || go test ./internal/db/ -v`

If no dedicated migration test exists, verify via the full test suite (Task 6).

- [ ] **Step 3: Commit**

```bash
git add internal/db/migrations/023_drop_event_ids.sql && git commit -m "migration: drop event_id columns from messages and reactions"
```

---

### Task 6: Update test files

**Files:**
- Modify: `internal/messages/messages_test.go`
- Modify: `internal/reactions/reactions_test.go`
- Modify: `internal/files/files_test.go`

- [ ] **Step 1: Update messages_test.go**

Remove the EventID assertion (lines 45-47):
```go
if msg.EventID == "" {
    t.Errorf("eventId should not be empty")
}
```

Delete the entire `TestNostrEventTags` function (lines 462-476).

Remove `groupID` argument (`"general"`) from every `svc.Create()` and `svc.CreateReply()` call. There are many — every call like `svc.Create(1, 1, "Hello world", "general")` becomes `svc.Create(1, 1, "Hello world")`, and `svc.CreateReply(parent.ID, 2, "Reply from bob", "general")` becomes `svc.CreateReply(parent.ID, 2, "Reply from bob")`.

- [ ] **Step 2: Update reactions_test.go**

Delete the entire `TestNostrEventKind7` function (lines 190-201).

Remove `groupID` argument (`"general"`) from every `svc.Add()` and `svc.Toggle()` call. E.g., `svc.Add(1, 1, "👍", "general")` becomes `svc.Add(1, 1, "👍")`, and `svc.Toggle(1, 1, "❤️", "general")` becomes `svc.Toggle(1, 1, "❤️")`.

- [ ] **Step 3: Update files_test.go**

At line 65, change:
```go
d.Exec("INSERT INTO messages (channel_id, user_id, content, event_id, created_at) VALUES (1, 1, 'test', 'evt1', datetime('now'))")
```
to:
```go
d.Exec("INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (1, 1, 'test', datetime('now'))")
```

- [ ] **Step 4: Run all tests**

Run: `cd /home/dev/code/relay-chat && make test`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add internal/messages/messages_test.go internal/reactions/reactions_test.go internal/files/files_test.go && git commit -m "test: update tests after Nostr removal"
```

---

### Task 7: Clean up Go dependencies

**Files:**
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: Run go mod tidy**

```bash
cd /home/dev/code/relay-chat && go mod tidy
```

Expected: removes `relay29`, `go-nostr`, `eventstore`, `khatru`, `badger`, `btcec`, `secp256k1`, `mattn/go-sqlite3`, and their transitive dependencies.

- [ ] **Step 2: Verify the build still works**

```bash
cd /home/dev/code/relay-chat && go build ./...
```

- [ ] **Step 3: Run full test suite**

```bash
cd /home/dev/code/relay-chat && make test
```

- [ ] **Step 4: Commit**

```bash
git add go.mod go.sum && git commit -m "chore: remove Nostr-related Go dependencies"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full build**

```bash
cd /home/dev/code/relay-chat && make build
```

- [ ] **Step 2: Run E2E tests if available**

```bash
cd /home/dev/code/relay-chat && make test-e2e
```

- [ ] **Step 3: Verify removed paths**

Confirm these paths no longer exist:
```bash
test ! -d /home/dev/code/relay-chat/internal/relay && echo "OK: internal/relay removed"
test ! -d /home/dev/code/relay-chat/relay && echo "OK: relay/ removed"
```

Confirm no Nostr imports remain:
```bash
cd /home/dev/code/relay-chat && grep -r "go-nostr\|relay29\|eventstore\|khatru\|badger\|SetRelayKey\|relayPriv\|NIP-29\|RELAY_DATABASE_PATH" --include="*.go" . && echo "FAIL: Nostr references remain" || echo "OK: no Nostr references"
```
