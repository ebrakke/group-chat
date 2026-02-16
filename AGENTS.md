# Relay Chat - Agent Instructions

## What This Is

Self-hosted private group chat built on Nostr (NIP-29). Ships as a single Go binary that embeds:
- NIP-29 relay at `/relay`
- JSON REST API at `/api/*`
- WebSocket hub at `/ws` for real-time messaging
- PWA-capable SPA frontend (vanilla JS, built with Bun, embedded via `go:embed`)

## Tech Stack

| Layer       | Tech                                          |
|-------------|-----------------------------------------------|
| Backend     | Go 1.24.4, stdlib `net/http`                  |
| Database    | SQLite (pure-Go via `modernc.org/sqlite`)     |
| Auth        | Argon2id passwords, 30-day session tokens     |
| Frontend    | Vanilla JS SPA, Bun bundler (no framework)    |
| Relay       | `fiatjaf/relay29` v0.5.1 + `khatru`           |
| Nostr       | `go-nostr` v0.52.3                            |
| Deploy      | Fly.io, Alpine container, persistent volume   |
| CI/CD       | Forgejo Actions (deploy, PR preview, cleanup) |
| E2E Tests   | Playwright 1.52.0 via Bun                     |

## Project Structure

```
cmd/app/                  # Go entrypoint + go:embed static assets
  main.go                 # Binary entrypoint, wires all services
  static/                 # Embedded static files (copied from frontend/dist at build time)

internal/                 # Go service layer
  api/                    # HTTP route handlers (REST JSON)
  auth/                   # User auth: bootstrap, login, signup, sessions (argon2id)
  channels/               # Channel CRUD + membership
  db/                     # SQLite connection + migrations (WAL mode)
  messages/               # Messages + threads (reply == thread), Nostr event signing
  reactions/              # Emoji reactions on messages, Nostr event signing
  relay/                  # NIP-29 relay integration (khatru + relay29)
  ws/                     # WebSocket hub for real-time delivery

relay/                    # Standalone NIP-29 relay binary (historical, for reference)
  main.go                 # Independent relay server (port 3334)

frontend/
  src/
    app.js                # Entire SPA logic (single file, ~916 lines)
    style.css             # All styles including mobile responsive (~661 lines)
    index.html            # Shell HTML with PWA meta tags
    sw.js                 # Service worker (cache-first for assets, network-first for navigation)
    manifest.json         # PWA manifest (standalone display, dark theme)
    icon-192.png          # PWA icon
    icon-512.png          # PWA icon
  build.js                # Custom Bun build script (content-hash cache busting)
  dist/                   # Build output (hashed filenames: app.{hash}.js, style.{hash}.css)

tests/e2e/                # Playwright E2E tests
  tests/
    e2e.spec.ts           # Local E2E test suite (6 serial tests)
    prod-smoke.spec.ts    # Deployed preview smoke tests (4 tests)
    mobile-audit.spec.ts  # Mobile UX audit (10+ tests, iPhone 13 device)
  playwright.config.ts    # Playwright config (Chromium, 30s timeout)

scripts/
  run-e2e.sh              # Builds everything, starts server on :8090, runs Playwright

.forgejo/workflows/       # CI/CD pipelines
  deploy.yml              # Production deploy on push to master
  preview.yml             # PR preview: ephemeral Fly app + smoke tests
  preview-cleanup.yml     # Destroy preview app on PR close

Makefile                  # build, run, test, test-e2e, frontend, clean
Dockerfile.fly            # Multi-stage: Bun build -> Go build (CGO) -> Alpine
fly.toml                  # Fly.io config (IAD region, 512MB, persistent /data volume)
archive/                  # Old configs, previous SvelteKit frontend, etc.
```

## Development

### Prerequisites

- **Go 1.24+** (installed at `/usr/local/go/bin/go`)
- **Bun** (install with `curl -fsSL https://bun.sh/install | bash`)
- After installing Bun: `export PATH="$HOME/.bun/bin:$PATH"`

### Build

```bash
make build        # Builds frontend (bun) + Go binary
make frontend     # Frontend only (bun install + build + copy to cmd/app/static/)
make run          # Build everything + start dev server on :8080
make test         # Go unit tests (./internal/...)
make test-e2e     # Full E2E (builds, starts server, runs Playwright)
make clean        # Remove binary, frontend/dist/, tmp/
```

### Run Dev Server

```bash
mkdir -p tmp
DATA_DIR=./tmp PORT=8080 ./relay-chat
```

The first user to visit gets the bootstrap flow (creates admin account).

### Environment Variables

| Variable              | Default         | Description                           |
|-----------------------|-----------------|---------------------------------------|
| `PORT`                | `8080`          | HTTP listen port                      |
| `DATA_DIR`            | `.`             | Directory for SQLite databases        |
| `DATABASE_PATH`       | `DATA_DIR/app.db` | App database path                   |
| `RELAY_DATABASE_PATH` | `DATA_DIR/relay.db`| Relay event store path              |
| `RELAY_PRIVKEY`       | (auto-generated)| NIP-29 relay private key (hex)        |
| `RELAY_DOMAIN`        | `localhost`     | Relay domain for NIP-29 events        |
| `ALLOWED_PUBKEYS`     | (none)          | Comma-separated pubkeys for relay     |

### Run E2E Tests

```bash
# Important: kill any stale process on port 8090 first
kill $(lsof -ti:8090) 2>/dev/null
./scripts/run-e2e.sh
```

The script:
1. Builds frontend with Bun
2. Copies dist to `cmd/app/static/`
3. Builds Go binary to a temp dir
4. Starts server on port **8090** (not 8080)
5. Waits for `/api/health` (max 30 attempts)
6. Installs Playwright + Chromium
7. Runs `tests/e2e.spec.ts` (6 serial tests)

### E2E Test Suites

| Suite               | Tests | Description                                   |
|---------------------|-------|-----------------------------------------------|
| `e2e.spec.ts`       | 6     | Full local flow: bootstrap, invite, messaging, threads, reactions |
| `prod-smoke.spec.ts`| 4     | Deployed preview: bootstrap/login, invite, signup, messaging |
| `mobile-audit.spec.ts`| 10+ | Mobile UX: iPhone 13 device, layout metrics, touch targets |

### Tailscale Access

This dev machine is `svc-relaychat-dev` at `100.101.95.102`. Dev server is accessible at `http://100.101.95.102:8080` from the Tailnet.

## Architecture Notes

### Static File Serving & Cache Busting

The build system (`frontend/build.js`) generates content-hashed filenames:
- `app.js` → `app.{hash}.js`, `style.css` → `style.{hash}.css`
- `index.html` and `sw.js` are rewritten with hashed references
- Service worker `CACHE_NAME` auto-bumped with combined hashes

`cmd/app/main.go` serves static files with smart caching:
- `index.html`, `sw.js` → `Cache-Control: no-cache` (always revalidate)
- Hashed assets → `Cache-Control: public, max-age=31536000, immutable`
- SPA fallback: 404s serve `index.html` for client-side routing

### Frontend Rendering

All HTML is rendered via JS functions in `app.js`:
- `renderBootstrap()` - First-run admin setup
- `renderLogin()` - Login + signup form with tab switching
- `renderMain()` - Main chat layout (sidebar + channels + messages + threads + admin)
- `selectChannel()` - Loads messages, updates header, handles routing
- `openThread()` / `closeThread()` - Thread panel management with routing
- `renderReactions()` - Emoji reaction pills per message
- `openAdminPage()` / `closeAdminPage()` - Full-screen admin overlay (mobile)

There is no templating library. DOM is built via `innerHTML` templates + manual event binding.

### Frontend Features

| Feature        | Details                                                        |
|----------------|----------------------------------------------------------------|
| Channels       | List, select, auto-join #general on signup                     |
| Messages       | Send, paginate (cursor-based `before` param), real-time via WS |
| Threads        | Open thread panel, reply, reply count on parent                |
| Reactions      | 10 emoji (👍👎❤️😂😮😢🔥🎉👀🙏), toggle, picker popup, real-time |
| URL Routing    | `/{channel}`, `/{channel}/t/{threadId}`, browser back/forward  |
| PWA            | Service worker, manifest, installable, offline SPA shell       |
| Mobile         | Swipe gestures for sidebar, full-screen thread/admin panels    |
| WebSocket      | Auto-reconnect with exponential backoff (max 30s)              |
| Connection     | Status banner shown during reconnection                        |
| Admin          | Invite management, user list, password reset (desktop sidebar + mobile overlay) |

### Key DOM Selectors

| Selector               | What it is                                    |
|------------------------|-----------------------------------------------|
| `#channel-header`      | Channel header div (contains hamburger + text)|
| `#channel-header-text` | Channel name span inside header               |
| `#sidebar-toggle`      | Hamburger button (visible only on mobile)     |
| `#sidebar-backdrop`    | Dark overlay behind sidebar (mobile only)     |
| `#thread-panel`        | Thread side panel (full-screen on mobile)     |
| `#channel-list`        | UL containing channel LIs                     |
| `#msg-input`           | Message composer input                        |
| `#composer`            | Composer container (hidden until channel selected) |
| `.reaction-picker`     | Fixed popup with emoji grid                   |
| `.reaction-pill`       | Single emoji reaction badge (`.mine` = user's)|
| `.admin-page`          | Full-screen admin overlay (mobile)            |
| `.connection-status`   | Reconnection status banner                    |
| `.hidden`              | Utility class: `display: none`                |

### WebSocket Events

Server pushes these event types via `hub.Broadcast()`:
- `new_message` - New message in a channel (payload: full message object)
- `new_reply` - New reply in a thread (payload: full reply object)
- `reaction_added` - Reaction added (payload: messageId, emoji, userId)
- `reaction_removed` - Reaction removed (payload: messageId, emoji, userId)

Client receives `{"type":"connected"}` on successful WebSocket auth.

### Mobile Responsive Design

Breakpoint: `@media (max-width: 768px)`

- Sidebar slides in/out as overlay (`.sidebar-open` class, `transform: translateX`)
- Backdrop overlay behind sidebar (`.sidebar-backdrop-visible`)
- Swipe gestures: left-edge swipe opens sidebar, swipe-left on open sidebar closes it
- Thread panel becomes full-screen fixed overlay (z-index: 900)
- Admin page becomes full-screen fixed overlay (z-index: 900)
- Hamburger button appears in channel header
- Settings gear button appears for mobile admin access
- Touch targets: 44px min-height on buttons/list items
- Composer input: 16px font-size to prevent iOS zoom
- Auth form buttons: 48px height

### Color Scheme

Terminal-inspired dark aesthetic:
- Background: `#1a1a2e` (primary), `#16213e` (secondary)
- Accent: `#e94560` (pink/red), hover: `#c73651`
- Secondary button: `#533483` / `#3f2768`
- Text: `#eee` (primary), `#ccc` (secondary), `#777` (muted)

### Database

SQLite with WAL mode, 5s busy timeout, foreign keys enabled. Max 1 connection.

Migrations tracked in `schema_migrations` table, run automatically on startup.

Files in `internal/db/migrations/`:
- `001_init.sql` - Users (username unique, role: admin|member), sessions (30-day, token indexed), invites (code unique), channels (name unique), channel_members (composite PK)
- `002_messages.sql` - Messages (self-referential parent_id for threads, event_id for Nostr), indexed on (channel_id, created_at) for top-level and (parent_id, created_at) for replies
- `003_reactions.sql` - Reactions (unique per message+user+emoji), indexed on message_id

### Nostr Integration

Messages and reactions are signed as Nostr events using the relay private key:
- Messages → kind 1 events with `h` tag (group) and optional `e` tag (parent for replies)
- Reactions → kind 7 events with `h` tag (group) and `e` tag (target message)
- Event IDs stored in `messages.event_id` and `reactions.event_id`

NIP-29 relay roles:
- **Admin**: Full permissions (delete, moderate, edit metadata)
- **Member**: Send messages only (no moderation)
- **Non-member**: No access

### API Endpoints

**Auth:**
- `GET /api/auth/has-users` - Check if bootstrapped
- `POST /api/auth/bootstrap` - Create first admin `{username, password, displayName}`
- `POST /api/auth/login` - Login `{username, password}` → sets HTTP-only session cookie
- `POST /api/auth/logout` - Logout (deletes session, clears cookie)
- `POST /api/auth/signup` - Invite-only registration `{username, password, displayName, inviteCode}`
- `GET /api/auth/me` - Current user info

**Channels:**
- `GET /api/channels` - List all channels
- `GET /api/channels/{id}/messages?limit=N&before=ID` - Channel messages (cursor pagination, default 50, max 100)

**Messages:**
- `POST /api/channels/{id}/messages` - Send message `{content}`
- `POST /api/messages/{id}/reply` - Reply in thread `{content}`
- `GET /api/messages/{id}/thread?limit=N&before=ID` - Thread replies (cursor pagination)

**Reactions:**
- `POST /api/messages/{id}/reactions` - Add reaction `{emoji}` (idempotent)
- `DELETE /api/messages/{id}/reactions/{emoji}` - Remove reaction

**Users (admin-only):**
- `GET /api/users` - List all users
- `POST /api/users/{id}/reset-password` - Reset user password `{password}`

**Invites (admin-only):**
- `GET /api/invites` - List invites
- `POST /api/invites` - Create invite `{expiresInHours?, maxUses?}`

**Health:**
- `GET /api/health` - `{"status":"ok"}`

**Auth mechanism:** Session token via `Authorization: Bearer <token>` header or `session` HTTP-only cookie (30-day expiry). New users auto-join #general channel.

### CI/CD Pipelines

**Production Deploy** (`.forgejo/workflows/deploy.yml`):
- Trigger: push to `master`/`main`
- Deploys to Fly.io via `flyctl deploy --remote-only`

**PR Preview** (`.forgejo/workflows/preview.yml`):
- Trigger: PR opened/updated
- Creates ephemeral Fly app `relay-chat-pr-{N}` (destroys old one first for clean state)
- Wipes volumes for deterministic E2E testing
- Runs `prod-smoke.spec.ts` against deployed preview
- Posts failure summary + Fly logs as PR comment on failure

**Preview Cleanup** (`.forgejo/workflows/preview-cleanup.yml`):
- Trigger: PR closed
- Destroys the ephemeral preview app

### Deployment

Fly.io config (`fly.toml`):
- Region: `iad`, VM: `shared-cpu-1x`, Memory: `512MB`
- Persistent volume mounted at `/data` for SQLite databases
- Health check: `GET /api/health` every 15s
- HTTPS enforced, min 1 machine running

Docker build (`Dockerfile.fly`):
- Stage 1: Bun 1.3.9 Alpine → frontend build
- Stage 2: Go 1.24 Alpine → binary build (CGO_ENABLED=1 for sqlite)
- Stage 3: Alpine 3.20 → minimal runtime image

### Go Service Layer

| Package    | Key Exports                                                    |
|------------|----------------------------------------------------------------|
| `api`      | `New(auth, channels, messages, reactions, hub)`, `ServeHTTP()` |
| `auth`     | `HasUsers`, `Bootstrap`, `Signup`, `Login`, `Logout`, `ValidateSession`, `CreateInvite`, `ListInvites`, `ListUsers`, `ResetPassword`, `GetUserByID` |
| `channels` | `EnsureGeneral`, `Create`, `GetByID`, `GetByName`, `List`, `AddMember`, `ListMembers`, `IsMember` |
| `messages` | `SetRelayKey`, `Create`, `CreateReply`, `GetByID`, `ListChannel`, `ListThread` |
| `reactions` | `SetRelayKey`, `Toggle`, `Add`, `Remove`, `SummaryForMessages` |
| `ws`       | `NewHub`, `Handler`, `Broadcast`                               |
| `relay`    | `New(Config{PrivateKey, Domain, DatabasePath, AllowedPubkeys})`|
| `db`       | `Open(path)` → runs migrations, returns `*DB`                 |

Allowed reaction emoji (hardcoded): `👍 👎 ❤️ 😂 😮 😢 🔥 🎉 👀 🙏`
