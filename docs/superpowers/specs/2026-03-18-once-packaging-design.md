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

## Changes

### Go Code (`cmd/app/main.go`)

1. **Add `/up` health endpoint** — simple inline handler on the top-level mux:
   ```go
   mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
       w.WriteHeader(http.StatusOK)
   })
   ```

2. **Add `GET /hooks/pre-backup` endpoint** — performs backup preparation internally using the app's own database connections, avoiding external `sqlite3` CLI dependency:
   - Calls `PRAGMA wal_checkpoint(TRUNCATE)` on `app.db` via the existing DB connection
   - Calls `db.Sync()` on the Badger store to flush memtables to disk
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
  - Installs `curl` for hook scripts to call internal endpoints
  - Exposes port 80

### Backup Hooks (`deploy/once/hooks/`)

**`pre-backup`** — Calls the app's internal backup endpoint to flush all stores:
```sh
#!/bin/sh
curl -sf http://localhost:80/hooks/pre-backup || exit 1
```

**`post-restore`** — Removes stale WAL/SHM and Badger lock files after restore:
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
```

## Out of Scope

- ONCE env var mapping (`SECRET_KEY_BASE`, SMTP) — Rails-specific, not applicable
- Update mechanism — standard Docker image rebuild
- Removing or modifying existing Fly.io deployment
