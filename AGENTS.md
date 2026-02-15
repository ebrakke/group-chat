# Relay Chat - Agent Instructions

## What This Is

Self-hosted private group chat built on Nostr (NIP-29). Ships as a single Go binary that embeds:
- NIP-29 relay at `/relay`
- JSON REST API at `/api/*`
- WebSocket hub at `/ws` for real-time messaging
- SPA frontend (vanilla JS, built with Bun, embedded via `go:embed`)

## Tech Stack

| Layer       | Tech                                      |
|-------------|-------------------------------------------|
| Backend     | Go 1.24, stdlib `net/http`                |
| Database    | SQLite (pure-Go, no cgo for app)          |
| Auth        | Argon2id passwords, session tokens        |
| Frontend    | Vanilla JS SPA, Bun bundler (no framework)|
| Relay       | `fiatjaf/relay29` + `khatru`              |
| Deploy      | Fly.io, Alpine container                  |
| CI/CD       | Forgejo Actions                           |
| E2E Tests   | Playwright via Bun                        |

## Project Structure

```
cmd/app/                  # Go entrypoint + go:embed static assets
  main.go                 # Binary entrypoint, wires all services
  static/                 # Embedded static files (copied from frontend/dist at build time)

internal/                 # Go service layer
  api/                    # HTTP route handlers (REST JSON)
  auth/                   # User auth: bootstrap, login, signup, sessions (argon2id)
  channels/               # Channel CRUD + membership
  db/                     # SQLite connection + migrations
  messages/               # Messages + threads (reply == thread)
  reactions/              # Emoji reactions on messages
  relay/                  # NIP-29 relay integration (khatru + relay29)
  ws/                     # WebSocket hub for real-time delivery

frontend/src/             # SPA source (no build framework)
  app.js                  # Entire SPA logic (single file, ~634 lines)
  style.css               # All styles including mobile responsive
  index.html              # Shell HTML (just loads app.js + style.css)

tests/e2e/                # Playwright E2E tests
  tests/e2e.spec.ts       # Local E2E test suite (6 tests)
  tests/prod-smoke.spec.ts # Deployed preview smoke tests
  playwright.config.ts    # Playwright config

scripts/
  run-e2e.sh              # Builds everything, starts server on :8090, runs Playwright

Makefile                  # build, run, test, test-e2e, frontend, clean
Dockerfile.fly            # Multi-stage: Bun build -> Go build -> Alpine
```

## Development

### Prerequisites

- **Go 1.24+** (installed at `/usr/local/go/bin/go`)
- **Bun** (install with `curl -fsSL https://bun.sh/install | bash`)
- After installing Bun: `export PATH="$HOME/.bun/bin:$PATH"`

### Build

```bash
make build        # Builds frontend (bun) + Go binary
make frontend     # Frontend only
make test         # Go unit tests
make test-e2e     # Full E2E (builds, starts server, runs Playwright)
```

### Run Dev Server

```bash
mkdir -p tmp
DATA_DIR=./tmp PORT=8080 ./relay-chat
```

The first user to visit gets the bootstrap flow (creates admin account).

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
5. Installs Playwright + Chromium
6. Runs `tests/e2e.spec.ts` (6 serial tests)

### Tailscale Access

This dev machine is `svc-relaychat-dev` at `100.101.95.102`. Dev server is accessible at `http://100.101.95.102:8080` from the Tailnet.

## Architecture Notes

### Frontend Rendering

All HTML is rendered via JS functions in `app.js`:
- `renderBootstrap()` - First-run admin setup
- `renderLogin()` - Login + signup form
- `renderMain()` - Main chat layout (sidebar + channels + messages + threads)
- `selectChannel()` - Loads messages, updates header
- `openThread()` / `closeThread()` - Thread panel management

There is no templating library. DOM is built via `innerHTML` templates + manual event binding.

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
| `.hidden`              | Utility class: `display: none`                |

### WebSocket Events

Server pushes these event types:
- `new_message` - New message in a channel
- `new_reply` - New reply in a thread
- `reaction_added` / `reaction_removed` - Reaction changes

### Mobile Responsive Design

Breakpoint: `@media (max-width: 768px)`

- Sidebar slides in/out as overlay (`.sidebar-open` class, `transform: translateX`)
- Backdrop overlay behind sidebar (`.sidebar-backdrop-visible`)
- Thread panel becomes full-screen fixed overlay
- Hamburger button appears in channel header
- Touch targets: 44px min-height on buttons/list items
- Composer input: 16px font-size to prevent iOS zoom

### Database

SQLite with migrations in `internal/db/migrations/`:
- `001_init.sql` - Users, sessions, channels, invites
- `002_messages.sql` - Messages table
- `003_reactions.sql` - Reactions table

### API Endpoints

Auth:
- `GET /api/auth/has-users` - Check if bootstrapped
- `POST /api/auth/bootstrap` - Create first admin
- `POST /api/auth/login` / `POST /api/auth/logout`
- `POST /api/auth/signup` - Invite-only registration
- `GET /api/auth/me` - Current user

Channels:
- `GET /api/channels` - List channels
- `GET /api/channels/:id/messages?limit=N` - Channel messages

Messages:
- `POST /api/channels/:id/messages` - Send message
- `POST /api/messages/:id/reply` - Reply in thread
- `GET /api/messages/:id/thread?limit=N` - Get thread replies

Reactions:
- `POST /api/messages/:id/reactions` - Add reaction
- `DELETE /api/messages/:id/reactions/:emoji` - Remove reaction

Invites:
- `GET /api/invites` - List invites (admin)
- `POST /api/invites` - Create invite (admin)

Health:
- `GET /api/health` - `{"status":"ok"}`
