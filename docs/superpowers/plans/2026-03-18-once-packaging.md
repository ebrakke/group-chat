# ONCE Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Relay Chat installable via Basecamp's ONCE platform by adding a `/up` endpoint, a `/-/pre-backup` endpoint, refactoring the relay package to expose `Sync()`/`Close()`, creating backup hook scripts, and adding a `Dockerfile.once`.

**Architecture:** Separate `Dockerfile.once` shares build stages with `Dockerfile.fly`, differs only in the runtime stage (port 80, `/storage` data dir). A new internal HTTP endpoint handles backup preparation. The relay package exposes its Badger backend for sync/close operations.

**Tech Stack:** Go, Docker, shell scripts

**Spec:** `docs/superpowers/specs/2026-03-18-once-packaging-design.md`

---

### Task 1: Refactor relay package to return Relay struct

**Files:**
- Modify: `internal/relay/relay.go`

- [ ] **Step 1: Change `New()` return type from `http.Handler` to `*Relay` struct**

Replace the current function signature and return a `Relay` struct that wraps the handler and Badger backend:

```go
// Relay wraps the NIP-29 relay handler and its underlying Badger store.
type Relay struct {
	handler http.Handler
	db      *badger.BadgerBackend
}

func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.handler.ServeHTTP(w, req)
}

func (r *Relay) Sync() error {
	return r.db.Sync()
}

func (r *Relay) Close() {
	r.db.Close()
}
```

Change the `New` function signature from:
```go
func New(cfg Config) (http.Handler, error) {
```
to:
```go
func New(cfg Config) (*Relay, error) {
```

Change the return at line 113 from:
```go
return r, nil
```
to:
```go
return &Relay{handler: r, db: db}, nil
```

- [ ] **Step 2: Update main.go to use the new Relay type**

In `cmd/app/main.go`, the `relayHandler` variable (line 115) is already typed via `:=`, so the type change propagates automatically. Add a `defer` after the relay is created:

After line 120 (`}`), add:
```go
defer relayHandler.Close()
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/dev/code/relay-chat && go build ./cmd/app`
Expected: Compiles with no errors (since `*Relay` satisfies `http.Handler` via `ServeHTTP`)

- [ ] **Step 4: Commit**

```bash
git add internal/relay/relay.go cmd/app/main.go
git commit -m "refactor: relay.New returns *Relay with Sync/Close methods"
```

---

### Task 2: Add `/up` and `/-/pre-backup` endpoints

**Files:**
- Modify: `cmd/app/main.go`

- [ ] **Step 1: Add `/up` health check endpoint**

After line 149 (`mux.Handle("/api/", apiHandler)`), add:

```go
// /up -> ONCE health check
mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})
```

- [ ] **Step 2: Add `/-/pre-backup` endpoint**

After the `/up` endpoint, add the backup preparation endpoint. It needs access to `database` (the `*db.DB`) and `relayHandler` (the `*relay.Relay`):

```go
// /-/pre-backup -> flush stores for ONCE backup (localhost only)
mux.HandleFunc("GET /-/pre-backup", func(w http.ResponseWriter, r *http.Request) {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if host != "127.0.0.1" && host != "::1" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if _, err := database.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		log.Printf("pre-backup: WAL checkpoint failed: %v", err)
		http.Error(w, "checkpoint failed", http.StatusInternalServerError)
		return
	}
	if err := relayHandler.Sync(); err != nil {
		log.Printf("pre-backup: Badger sync failed: %v", err)
		http.Error(w, "sync failed", http.StatusInternalServerError)
		return
	}
	log.Printf("pre-backup: stores flushed successfully")
	w.WriteHeader(http.StatusOK)
})
```

Add `"net"` to the import block at the top of the file.

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/dev/code/relay-chat && go build ./cmd/app`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add cmd/app/main.go
git commit -m "feat: add /up and /-/pre-backup endpoints for ONCE"
```

---

### Task 3: Create backup hook scripts

**Files:**
- Create: `deploy/once/hooks/pre-backup`
- Create: `deploy/once/hooks/post-restore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p deploy/once/hooks
```

- [ ] **Step 2: Create `pre-backup` hook**

Create `deploy/once/hooks/pre-backup`:
```sh
#!/bin/sh
wget -qO /dev/null http://localhost:80/-/pre-backup || exit 1
```

- [ ] **Step 3: Create `post-restore` hook**

Create `deploy/once/hooks/post-restore`:
```sh
#!/bin/sh
rm -f /storage/app.db-wal /storage/app.db-shm
rm -f /storage/relay/LOCK
```

- [ ] **Step 4: Make hooks executable**

```bash
chmod +x deploy/once/hooks/pre-backup deploy/once/hooks/post-restore
```

- [ ] **Step 5: Commit**

```bash
git add deploy/once/hooks/
git commit -m "feat: add ONCE backup hook scripts"
```

---

### Task 4: Create Dockerfile.once

**Files:**
- Create: `Dockerfile.once`

- [ ] **Step 1: Create the Dockerfile**

Create `Dockerfile.once` reusing build stages from `Dockerfile.fly` with ONCE-specific runtime:

```dockerfile
# ONCE-compatible build for Relay Chat
# Requirements: port 80, /up health check, /storage persistence

# --- frontend build (bun) ---
FROM oven/bun:1.3.9-alpine AS web
WORKDIR /src
COPY frontend/ ./frontend/
WORKDIR /src/frontend
RUN bun install --frozen-lockfile
RUN bun run build

# --- go build ---
FROM golang:1.24-alpine AS build
WORKDIR /src
RUN apk add --no-cache ca-certificates build-base git

ARG VERSION=dev

# go deps
COPY go.mod go.sum ./
RUN go mod download

# app source
COPY .git/ ./.git/
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY relay/ ./relay/

# embed built SPA assets
COPY --from=web /src/frontend/dist/ ./cmd/app/static/

# build binary (cgo enabled for go-sqlite3)
ENV CGO_ENABLED=1
RUN COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) && \
    BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) && \
    go build -ldflags "-X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" \
    -o /out/relay-chat ./cmd/app

# --- ONCE runtime ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && update-ca-certificates
WORKDIR /app
COPY --from=build /out/relay-chat ./relay-chat

# ONCE backup/restore hooks
COPY deploy/once/hooks /hooks

ENV PORT=80
ENV DATA_DIR=/storage
EXPOSE 80

CMD ["/app/relay-chat"]
```

- [ ] **Step 2: Verify Docker build**

Run: `docker build -f Dockerfile.once -t relay-chat:once .`
Expected: Builds successfully

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.once
git commit -m "feat: add Dockerfile.once for ONCE platform"
```
