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

## Changes

### Go Code (`cmd/app/main.go`)

Add a `/up` health endpoint that aliases the existing `/api/health` handler. One line addition to the route setup.

### `Dockerfile.once`

New Dockerfile with three stages:

- **Stage 1 (frontend):** Identical to `Dockerfile.fly` — Bun installs deps and builds SvelteKit.
- **Stage 2 (Go build):** Identical to `Dockerfile.fly` — builds the Go binary with embedded frontend assets.
- **Stage 3 (runtime):** Differs from `Dockerfile.fly`:
  - `ENV PORT=80` (instead of 8080)
  - `ENV DATA_DIR=/storage` (instead of /data)
  - No `mkdir /data` — ONCE mounts `/storage` automatically
  - Installs `sqlite3` CLI for backup hooks
  - Copies `/hooks/pre-backup` and `/hooks/post-restore` from `deploy/once/hooks/`
  - Exposes port 80

### Backup Hooks (`deploy/once/hooks/`)

**`pre-backup`** — Forces a WAL checkpoint before ONCE snapshots `/storage`:
```sh
#!/bin/sh
sqlite3 /storage/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

**`post-restore`** — Removes stale WAL/SHM files after ONCE restores from backup:
```sh
#!/bin/sh
rm -f /storage/app.db-wal /storage/app.db-shm
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
