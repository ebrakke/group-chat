# Remove Nostr/Relay Architecture

## Summary

Remove all Nostr (NIP-29) and relay infrastructure from Relay Chat. The app already functions as a traditional REST/WebSocket chat system — Nostr is a server-side sidecar that creates signed events nobody consumes. Removing it simplifies the codebase, eliminates unused dependencies, and frees the architecture from spec conformance constraints.

## Motivation

- No plans to export data to Nostr or support external Nostr clients
- Nostr event signing adds overhead with no consumer
- NIP-29 conformance constrains future features (e.g., server-side group encryption)
- The relay's Badger database is a separate data store that adds operational complexity
- `SetRelayKey()` is never called in production — events are signed with throwaway keys, confirming the feature is vestigial
- Removing `eventstore` also removes the transitive `mattn/go-sqlite3` (cgo) dependency, keeping the build pure-Go

## Scope

**Frontend:** No changes. The frontend has zero knowledge of Nostr — no event IDs, public keys, or relay concepts are surfaced in the TypeScript types, API client, or WebSocket handler.

**Backend:** Server-side only. All changes are deletions or simplifications.

## Changes

### 1. Remove `createEvent()` from message service

**File:** `internal/messages/messages.go`

- Delete `createEvent()` function (lines ~588-623)
- Delete `randomHex()` helper if it has no remaining callers after `createEvent()` removal
- Delete `SetRelayKey()` method and `relayPriv` field from `Service` struct
- Remove `createEvent()` calls from `Create()` and `CreateReply()`
- Remove `event_id` from all SQL INSERT/SELECT statements in this file
- Remove `EventID` field from the `Message` struct
- Remove `go-nostr` import

### 2. Remove `createEvent()` from reaction service

**File:** `internal/reactions/reactions.go`

- Delete `createEvent()` function (lines ~275-310)
- Delete `SetRelayKey()` method and `relayPriv` field from `Service` struct
- Remove `createEvent()` calls from `Add()` and `Toggle()`
- Remove `event_id` from all SQL INSERT/SELECT statements in this file
- Remove `EventID` field from the `Reaction` struct
- Remove `go-nostr` import

### 3. Delete relay package

**Directory:** `internal/relay/`

- Delete entire directory. Contains the NIP-29 relay handler wrapping khatru29 with Badger storage, role definitions, and action permissions.

### 4. Delete standalone relay binary

**Directory:** `relay/`

- Delete entire directory including `relay/go.mod`, `relay/go.sum`, `relay/Dockerfile`, and `relay/main.go`. This is an alternative deployment mode using SQLite-backed eventstore that is unused.

### 5. Remove relay wiring from main

**File:** `cmd/app/main.go`

- Remove `internalrelay` import
- Remove relay initialization block (`internalrelay.New(...)`, `defer relayHandler.Close()`)
- Remove `/relay` and `/relay/` mux routes
- Remove relay sync from backup handler
- Remove `RELAY_DATABASE_PATH` env var lookup and `relayDBPath` variable

### 6. Database migration

**File:** `internal/db/migrations/023_drop_event_ids.sql`

The index must be dropped before the column. Migration SQL:

```sql
DROP INDEX IF EXISTS idx_messages_event_id;
ALTER TABLE messages DROP COLUMN event_id;
ALTER TABLE reactions DROP COLUMN event_id;
```

modernc.org/sqlite implements SQLite 3.46+, which supports `DROP COLUMN` (available since 3.35.0).

### 7. Clean up Go dependencies

- Run `go mod tidy` to remove:
  - `github.com/fiatjaf/relay29`
  - `github.com/fiatjaf/eventstore`
  - `github.com/nbd-wtf/go-nostr`
  - `github.com/fiatjaf/khatru` (indirect)
  - `github.com/dgraph-io/badger/v4`
  - `github.com/btcsuite/btcd/btcec/v2` (if no other consumer)
  - `github.com/decred/dcrd/dcrec/secp256k1/v4` (if no other consumer)
  - All transitive dependencies only needed by the above

### 8. Remove `groupID` parameter plumbing

The `groupID` parameter is passed from API handlers into message and reaction service methods solely for Nostr event tagging. After removing `createEvent()`:

- Remove `groupID` parameter from `messages.Create()` and `messages.CreateReply()` signatures
- Remove `groupID` parameter from `reactions.Add()` and `reactions.Toggle()` signatures
- Update all call sites in API handlers

### 9. Update test files

- `internal/messages/messages_test.go` — delete `TestNostrEventTags` test, remove `EventID` assertions, remove `groupID` arguments from `Create()`/`CreateReply()` calls
- `internal/reactions/reactions_test.go` — delete `TestNostrEventKind7` test, remove `groupID` arguments from `Add()`/`Toggle()` calls
- `internal/files/files_test.go` — remove `event_id` from test fixture INSERT statements

## What stays unchanged

- All REST API endpoints and their request/response contracts
- WebSocket protocol and event types
- Authentication, sessions, invites
- Channels, threads, mentions, link previews
- File uploads, calendar, search
- Push notifications
- Branding, themes
- Bot system
- Frontend code (zero changes)

## Verification

- `go build ./...` compiles
- `make test` passes
- `make test-e2e` passes
- App starts, messages and reactions work without event_id
- `/relay` endpoint no longer served
- Badger data directory no longer created

## Deployment note

Existing deployments will have a `/data/relay/` Badger directory that is no longer used. It can be safely deleted after upgrading.
