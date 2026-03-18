# ONCE Packaging for Relay Chat

## Summary

Package Relay Chat as a [ONCE](https://github.com/basecamp/once)-compatible Docker image, coexisting alongside the existing Fly.io deployment.

## ONCE Requirements

ONCE expects apps to:
1. Serve HTTP on port **80**
2. Provide a health check at **`/up`**
3. Store persistent data in **`/storage`**
4. Be packaged as a Docker container

## Approach

**Separate Dockerfile** (`Dockerfile.once`) that shares the same multi-stage build as `Dockerfile.fly` (frontend via Bun, Go binary compilation) but differs only in the final runtime stage.

## Data Under `/storage`

ONCE mounts a persistent volume at `/storage`. Relay Chat stores three types of data there:

- **`/storage/app.db`** — SQLite database (users, channels, messages, etc.)
- **`/storage/relay/`** — Badger key-value store directory (NIP-29 relay events)
- **`/storage/uploads/`** — User-uploaded files

All three are covered by ONCE's file-level backup of `/storage`.

Note: `RELAY_DATABASE_PATH` must not be overridden, as it controls where the Badger directory is created (derived from `$DATA_DIR/relay.db` → `$DATA_DIR/relay/`).

## Changes

### Relay Package (`internal/relay/relay.go`)

Modify `relay.New()` to return a `Relay` struct instead of just `http.Handler`. The struct exposes:
- `ServeHTTP()` — the existing relay handler (satisfies `http.Handler`)
- `Sync()` — flushes the Badger memtables to disk for backup safety
- `Close()` — cleanly shuts down the Badger store

This is needed because the Badger backend is currently encapsulated inside `New()` and not accessible to `main.go`. The `Close()` method ensures clean Badger shutdown, which is important for ONCE where containers are stopped/restarted frequently.

### Go Code (`cmd/app/main.go`)

1. **Add `GET /up` health endpoint** — simple inline handler on the top-level mux:
   ```go
   mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
       w.WriteHeader(http.StatusOK)
   })
   ```

2. **Add `GET /-/pre-backup` endpoint** — localhost-only, performs backup preparation internally:
   - Rejects requests not from `127.0.0.1` / `::1` (prevents public access to operational endpoint)
   - Calls `PRAGMA wal_checkpoint(TRUNCATE)` on `app.db` via the existing DB connection
   - Calls `Sync()` on the relay's Badger store
   - Returns 200 on success, 500 on failure

### `Dockerfile.once`

New Dockerfile with three stages:

- **Stage 1 (frontend):** Identical to `Dockerfile.fly` — Bun installs deps and builds SvelteKit.
- **Stage 2 (Go build):** Identical to `Dockerfile.fly` — builds the Go binary with embedded frontend assets.
- **Stage 3 (runtime):** Differs from `Dockerfile.fly`:
  - `ENV PORT=80` (instead of 8080)
  - `ENV DATA_DIR=/storage` (instead of /data)
  - No `mkdir /data` — ONCE mounts `/storage` automatically
  - Copies `/hooks/pre-backup` and `/hooks/post-restore` from `deploy/once/hooks/`
  - Uses `wget` (built into Alpine via busybox) for hook scripts — no extra packages needed
  - Exposes port 80

### Backup Hooks (`deploy/once/hooks/`)

**`pre-backup`** — Calls the app's internal backup endpoint to flush all stores:
```sh
#!/bin/sh
wget -qO /dev/null http://localhost:80/-/pre-backup || exit 1
```

**`post-restore`** — Removes stale WAL/SHM and Badger lock files after restore. Badger's built-in recovery runs on `Init()` at next startup to handle any MANIFEST inconsistencies:
```sh
#!/bin/sh
rm -f /storage/app.db-wal /storage/app.db-shm
rm -f /storage/relay/LOCK
```

### File Structure

New files:
```
Dockerfile.once
deploy/once/hooks/pre-backup
deploy/once/hooks/post-restore
```

Modified files:
```
cmd/app/main.go
internal/relay/relay.go
```

## Out of Scope

- ONCE env var mapping (`SECRET_KEY_BASE`, SMTP) — Rails-specific, not applicable
- Update mechanism — standard Docker image rebuild
- Removing or modifying existing Fly.io deployment
