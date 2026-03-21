# Remove Nostr/Relay Architecture

## Summary

Remove all Nostr (NIP-29) and relay infrastructure from Relay Chat. The app already functions as a traditional REST/WebSocket chat system — Nostr is a server-side sidecar that creates signed events nobody consumes. Removing it simplifies the codebase, eliminates unused dependencies, and frees the architecture from spec conformance constraints.

## Motivation

- No plans to export data to Nostr or support external Nostr clients
- Nostr event signing adds overhead with no consumer
- NIP-29 conformance constrains future features (e.g., server-side group encryption)
- The relay's Badger database is a separate data store that adds operational complexity
- `SetRelayKey()` is never called in production — events are signed with throwaway keys, confirming the feature is vestigial

## Scope

**Frontend:** No changes. The frontend has zero knowledge of Nostr — no event IDs, public keys, or relay concepts are surfaced in the TypeScript types, API client, or WebSocket handler.

**Backend:** Server-side only. All changes are deletions or simplifications.

## Changes

### 1. Remove `createEvent()` from message service

**File:** `internal/messages/messages.go`

- Delete `createEvent()` function (lines ~588-623)
- Delete `SetRelayKey()` method and `relayPriv` field from `Service` struct
- Remove `createEvent()` calls from `Create()` and `CreateReply()`
- Remove `event_id` from all SQL INSERT/SELECT statements in this file
- Remove `EventID` field from the `Message` struct
- Remove `go-nostr` import

### 2. Remove `createEvent()` from reaction service

**File:** `internal/reactions/reactions.go`

- Delete `createEvent()` function (lines ~275-310)
- Delete `SetRelayKey()` method and `relayPriv` field from `Service` struct
- Remove `createEvent()` call from `Toggle()`
- Remove `event_id` from all SQL INSERT/SELECT statements in this file
- Remove `EventID` field from the `Reaction` struct
- Remove `go-nostr` import

### 3. Delete relay package

**Directory:** `internal/relay/`

- Delete entire directory. Contains the NIP-29 relay handler wrapping khatru29 with Badger storage, role definitions, and action permissions.

### 4. Delete standalone relay binary

**Directory:** `relay/`

- Delete entire directory including `relay/go.mod` and `relay/go.sum`. This is an alternative deployment mode using SQLite-backed eventstore that is unused.

### 5. Remove relay wiring from main

**File:** `cmd/app/main.go`

- Remove `internalrelay` import
- Remove relay initialization block (`internalrelay.New(...)`, `defer relayHandler.Close()`)
- Remove `/relay` and `/relay/` mux routes
- Remove relay sync from backup handler
- Remove `groupID` parameter passing where it only existed for Nostr event tagging (trace through API handlers to confirm if `groupID` is used elsewhere)

### 6. Database migration

**File:** `internal/db/migrations/023_drop_event_ids.sql`

- Drop `event_id` column from `messages` table
- Drop `event_id` column from `reactions` table
- Drop `idx_messages_event_id` index

SQLite doesn't support `ALTER TABLE DROP COLUMN` before 3.35.0, but modernc.org/sqlite supports it. The migration should use `ALTER TABLE messages DROP COLUMN event_id` directly.

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

The `groupID` parameter is passed from API handlers into `messages.Create()` and `reactions.Toggle()` solely for Nostr event tagging. After removing `createEvent()`:

- Remove `groupID` parameter from `messages.Create()` and `messages.CreateReply()` signatures
- Remove `groupID` parameter from `reactions.Toggle()` signature
- Update all call sites in API handlers

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
- E2E and unit tests (unless they reference event_id)

## Verification

- `go build ./...` compiles
- `make test` passes
- `make test-e2e` passes
- App starts, messages and reactions work without event_id
- `/relay` endpoint no longer served
- Badger data directory no longer created
