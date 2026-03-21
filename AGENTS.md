# Relay Chat - Agent Instructions

> **⚠️ CRITICAL: This project uses [Bun](https://bun.sh) for all frontend tooling. NEVER use npm/yarn/pnpm. All build commands use `bun`.**

## What This Is

Self-hosted private group chat. Ships as a single Go binary that embeds:
- JSON REST API at `/api/*`
- WebSocket hub at `/ws` for real-time messaging
- PWA-capable SPA frontend (SvelteKit 5, built with Bun, embedded via `go:embed`)

## Tech Stack

| Layer       | Tech                                          |
|-------------|-----------------------------------------------|
| Backend     | Go 1.25, stdlib `net/http`                    |
| Database    | SQLite (pure-Go via `modernc.org/sqlite`, no cgo) |
| Auth        | Argon2id passwords, 30-day session tokens     |
| Frontend    | SvelteKit 5 (runes), Tailwind CSS v4, TypeScript, Bun |
| Icons       | `lucide-svelte`                               |
| Deploy      | ONCE (Docker), Alpine container, persistent volume |
| CI/CD       | Forgejo Actions (Docker publish to GHCR)      |
| E2E Tests   | Playwright via Bun                            |

## Project Structure

```
cmd/app/                  # Go entrypoint + go:embed static assets
  main.go                 # Binary entrypoint, wires all services
  static/                 # Embedded static files (copied from frontend/dist at build time)

internal/                 # Go service layer
  api/                    # HTTP route handlers (REST JSON)
  auth/                   # User auth: bootstrap, login, signup, sessions (argon2id)
  bots/                   # Bot identity, token auth, channel bindings, scope checks
  branding/               # Instance branding (app name, icon resize)
  calendar/               # Group calendar events (CRUD, range list, validation)
  channels/               # Channel CRUD + membership
  db/                     # SQLite connection + migrations (WAL mode)
  files/                  # File upload, attachment, serving
  messages/               # Messages + threads (reply == thread), @mention extraction
  notifications/          # Push notifications (web push via VAPID, webhooks)
  reactions/              # Emoji reactions on messages
  search/                 # Full-text message search (SQLite FTS5)
  ws/                     # WebSocket hub for real-time delivery (filtered broadcast for bots)

examples/
  echo-bot/               # Example bot: connects via WS, echoes @mentions back

frontend/
  src/
    app.js                # Entire SPA logic (single file, ~1650 lines)
    style.css             # All styles including mobile responsive (~1050 lines)
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
  docker-publish.yml      # Build + publish Docker image to GHCR (master→:dev, v*→:latest)

Makefile                  # build, run, test, test-e2e, frontend, clean
Dockerfile.once           # Multi-stage: Bun build -> Go build (pure Go) -> Alpine (ONCE deployment)
```

## Development

### Prerequisites

- **Go 1.24+** (installed at `/usr/local/go/bin/go`)
- **Bun** (install with `curl -fsSL https://bun.sh/install | bash`)
- After installing Bun: `export PATH="$HOME/.bun/bin:$PATH"`

### Build & Run

```bash
make dev          # Build + (re)start dev server on :8080 — kills stale process first
make build        # Build frontend (bun) + Go binary only
make run          # Build + start server foreground (same as dev but no auto-kill)
make frontend     # Frontend only (bun install + build + copy to cmd/app/static/)
make test         # Go unit tests (./internal/...)
make test-e2e     # Full E2E (builds, starts server, runs Playwright)
make clean        # Remove binary, frontend/dist/, tmp/
```

### Dev Workflow

```bash
make dev          # First time: builds everything, starts on http://localhost:8080
                  # Visit in browser → bootstrap flow creates admin account
                  # DB persists in ./tmp/app.db between restarts

# After editing Go, JS, or CSS:
make dev          # Rebuilds frontend+binary, kills old process, restarts
                  # Hard-refresh browser (Ctrl+Shift+R) to bypass service worker cache
```

**Important**: The binary embeds static files at build time (`go:embed`). You must rebuild (`make dev` or `make build`) after any frontend change — there is no hot-reload.

### Environment Variables

| Variable              | Default         | Description                           |
|-----------------------|-----------------|---------------------------------------|
| `PORT`                | `8080`          | HTTP listen port                      |
| `DATA_DIR`            | `.`             | Directory for SQLite database + uploads |
| `DATABASE_PATH`       | `DATA_DIR/app.db` | App database path                   |
| `BASE_URL`            | `http://localhost:8080` | Public URL (used for push notifications) |
| `DEV_MODE`            | (unset)         | Set to `true` to auto-create admin/admin user |

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
- `openThread()` / `closeThread()` - Thread overlay panel with backdrop
- `renderReactions()` - Emoji reaction pills per message
- `openAdminPage()` / `closeAdminPage()` - Centered modal overlay
- `showMyThreads()` - Cross-channel "My Threads" view
- `openThreadFromSummary()` - Navigate from thread summary to channel + thread

There is no templating library. DOM is built via `innerHTML` templates + manual event binding.

### Frontend Features

| Feature        | Details                                                        |
|----------------|----------------------------------------------------------------|
| Channels       | List, select, auto-join #general on signup                     |
| Messages       | Send, paginate (cursor-based `before` param), real-time via WS |
| Threads        | Overlay panel with backdrop, reply, reply count on parent      |
| My Threads     | Cross-channel view of all threads user participated in, sorted by activity |
| Reactions      | 10 emoji (👍👎❤️😂😮😢🔥🎉👀🙏), toggle, picker popup, real-time |
| URL Routing    | `/{channel}`, `/{channel}/t/{threadId}`, `/threads`, browser back/forward |
| PWA            | Service worker, manifest, installable, offline SPA shell       |
| Mobile         | Swipe gestures for sidebar, full-screen thread/admin panels    |
| WebSocket      | Auto-reconnect with exponential backoff (max 30s)              |
| Connection     | Status banner shown during reconnection                        |
| Admin          | Invite management, user list, password reset (centered modal overlay) |
| Bots           | Bot badge on messages, admin bot management (create, tokens, channel bindings) |

### Key DOM Selectors

| Selector               | What it is                                    |
|------------------------|-----------------------------------------------|
| `#channel-header`      | Channel header div (contains hamburger + text)|
| `#channel-header-text` | Channel name span inside header               |
| `#sidebar-toggle`      | Hamburger button (visible only on mobile)     |
| `#sidebar-backdrop`    | Dark overlay behind sidebar (mobile only)     |
| `#thread-panel`        | Thread overlay panel (slide-from-right, `.visible` class) |
| `#thread-backdrop`     | Click-to-close backdrop behind thread panel   |
| `#my-threads-btn`      | "My Threads" sidebar button                   |
| `#channel-list`        | UL containing channel LIs                     |
| `#msg-input`           | Message composer input                        |
| `#composer`            | Composer container (hidden until channel selected) |
| `.reaction-picker`     | Fixed popup with emoji grid                   |
| `.reaction-pill`       | Single emoji reaction badge (`.mine` = user's)|
| `.admin-page`          | Admin modal overlay (backdrop + centered `.admin-page-inner`) |
| `.connection-status`   | Reconnection status banner                    |
| `.hidden`              | Utility class: `display: none`                |
| `.visible`             | Toggle class for thread panel and admin overlay |

### WebSocket Events

Server pushes these event types via `hub.Broadcast()`:
- `new_message` - New message in a channel (payload: full message object with `mentions` array)
- `new_reply` - New reply in a thread (payload: full reply object with `mentions` array)
- `reaction_added` - Reaction added (payload: messageId, emoji, userId)
- `reaction_removed` - Reaction removed (payload: messageId, emoji, userId)
- `channel_created` - New channel created (payload: channel object)

Client receives `{"type":"connected"}` on successful WebSocket auth.

Bot clients only receive events from their bound channels (filtered by `ChannelID` on the Event struct, which is not serialized to JSON).

### Desktop Panel UX

- Thread panel: fixed overlay sliding from right (`width: min(480px, 90vw)`, `transform: translateX` animation, `.visible` class toggle)
- Thread backdrop: `#thread-backdrop` click-to-close behind thread panel
- Admin/settings: centered modal overlay (`.admin-page` backdrop + `.admin-page-inner` card)
- Settings gear: visible on all screen sizes (`display: inline-flex`)
- Escape key: closes thread panel and admin overlay

### Mobile Responsive Design

Breakpoint: `@media (max-width: 768px)`

- Sidebar slides in/out as overlay (`.sidebar-open` class, `transform: translateX`)
- Backdrop overlay behind sidebar (`.sidebar-backdrop-visible`)
- Swipe gestures: left-edge swipe opens sidebar, swipe-left on open sidebar closes it
- Thread panel becomes full-screen fixed overlay (z-index: 900)
- Admin page becomes full-screen fixed overlay (z-index: 900)
- Hamburger button appears in channel header
- Touch targets: 44px min-height on buttons/list items
- Composer input: 16px font-size to prevent iOS zoom
- Auth form buttons: 48px height

### Color Scheme

GitHub Dark-inspired palette:
- Background: `#0d1117` (primary), `#161b22` (panels/sidebar)
- Accent: `#58a6ff` (blue links/buttons), hover: `#79b8ff`
- Borders: `#30363d`
- Error/destructive: `#f85149`
- Bot badge: `#8b5cf6` (purple)
- Text: `#e6edf3` (primary), `#8b949e` (secondary/muted)

### Database

SQLite with WAL mode, 5s busy timeout, foreign keys enabled. Max 1 connection.

Migrations tracked in `schema_migrations` table, run automatically on startup.

Files in `internal/db/migrations/`:
- `001_init.sql` - Users (username unique, role: admin|member), sessions (30-day, token indexed), invites (code unique), channels (name unique), channel_members (composite PK)
- `002_messages.sql` - Messages (self-referential parent_id for threads), indexed on (channel_id, created_at) for top-level and (parent_id, created_at) for replies
- `003_reactions.sql` - Reactions (unique per message+user+emoji), indexed on message_id
- `004_bots.sql` - Recreates users table with `'bot'` role, adds bot_tokens (revocable opaque tokens) and bot_channel_bindings (read/write scopes per channel)
- `005_my_threads.sql` - Index on `messages(user_id, parent_id)` for My Threads query

Note: Migration runner disables `PRAGMA foreign_keys` before each migration transaction to support table recreation (SQLite cannot alter CHECK constraints in-place).

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

**Threads:**
- `GET /api/me/threads?limit=N` - List threads user participated in, sorted by last activity (default 30, max 100)

**Reactions:**
- `POST /api/messages/{id}/reactions` - Add reaction `{emoji}` (idempotent)
- `DELETE /api/messages/{id}/reactions/{emoji}` - Remove reaction

**Users:**
- `GET /api/users/search?q={prefix}` - Search users by username/displayName prefix (authenticated, returns max 10)
- `GET /api/users` - List all users (admin-only)
- `POST /api/users/{id}/reset-password` - Reset user password `{password}` (admin-only)

**Invites (admin-only):**
- `GET /api/invites` - List invites
- `POST /api/invites` - Create invite `{expiresInHours?, maxUses?}`

**Bots (admin-only):**
- `GET /api/bots` - List all bots
- `POST /api/bots` - Create bot `{username, displayName}`
- `DELETE /api/bots/{id}` - Delete bot (cascades tokens + bindings)
- `GET /api/bots/{id}/tokens` - List tokens (without plaintext value)
- `POST /api/bots/{id}/tokens` - Generate token `{label}` → returns plaintext once
- `DELETE /api/bots/tokens/{id}` - Revoke token
- `GET /api/bots/{id}/bindings` - List channel bindings
- `POST /api/bots/{id}/bindings` - Bind to channel `{channelId, canRead?, canWrite?}`
- `DELETE /api/bots/{id}/bindings/{channelId}` - Unbind from channel

**Calendar (group-wide, any authenticated user can view/create/edit; delete = creator or admin):**
- `GET /api/calendar?from=ISO&to=ISO` - List events (optional range filter). Returns `CalendarEvent[]`.
- `POST /api/calendar` - Create event `{title, startTime, endTime, comments?}` (RFC 3339). Broadcasts `calendar_event_created`.
- `GET /api/calendar/{id}` - Get single event.
- `PUT /api/calendar/{id}` - Update event (same body as create). Broadcasts `calendar_event_updated`.
- `DELETE /api/calendar/{id}` - Delete (403 if not creator or admin). Broadcasts `calendar_event_deleted` with `{id}`.

**Health:**
- `GET /api/health` - `{"status":"ok"}`

**Auth mechanism:** Session token via `Authorization: Bearer <token>` header or `session` HTTP-only cookie (30-day expiry). Bot tokens also accepted via `Authorization: Bearer <token>` — `requireAuth` tries session first, then bot token. New users auto-join #general channel.

### Bot Platform

Bots are first-class users with `role='bot'` in the users table. They authenticate with revocable opaque tokens (not session tokens) and receive filtered WebSocket events.

**Key concepts:**
- **Bot identity**: A user row with `role='bot'`, no password_hash. Created/managed via admin API.
- **Bot tokens**: 64-char hex tokens stored in `bot_tokens`. Shown once on creation, cannot be retrieved. Can be revoked. Multiple tokens per bot supported (rotate without downtime).
- **Channel bindings**: `bot_channel_bindings` table maps bot → channel with `can_read` and `can_write` boolean scopes. No binding = no access.
- **Dual auth**: `requireAuth()` tries session token first, then bot token. Transparent to all handlers — they just get an `*auth.User` back with `IsBot: true`.
- **Hub filtering**: Bot WebSocket clients only receive events from bound channels (ChannelID field on Event struct, not serialized to JSON).
- **@mentions**: Messages include a `mentions` array extracted from `@username` patterns in content. Bots use this to detect when they're addressed.
- **Mention autocomplete**: Typing `@` in the message or reply input shows a dropdown of matching users (backed by `GET /api/users/search`). Supports keyboard navigation (arrows, Enter/Tab, Escape) and touch on mobile.
- **Permission enforcement**: Bot message/reply creation checks `bots.CanWrite(botID, channelID)`, returns 403 if not authorized.

**Key structs:**
- `auth.User` has `IsBot bool` field (derived from `Role == "bot"`)
- `messages.Message` has `IsBot bool` and `Mentions []string` fields
- `ws.AuthResult` — returned by Hub.AuthFunc: `{UserID, IsBot, ChannelIDs}`
- `ws.Event` has `ChannelID int64` (json:"-") for bot filtering
- `bots.Bot`, `bots.BotToken`, `bots.ChannelBinding` — service-layer structs

**Frontend:**
- Bot messages display a purple `BOT` badge (`.bot-badge` CSS class)
- Admin panel has a "Bots" card (desktop sidebar + mobile admin page)
- Manage modal: token list with revoke, generate with show-once display, channel binding management

**Echo bot example** (`examples/echo-bot/main.go`):
```bash
go run ./examples/echo-bot -token <bot-token> -username echo-bot
```
Connects via WebSocket, listens for `new_message`/`new_reply` events with matching @mention, echoes content back to the same channel/thread.

### CI/CD Pipelines

**Docker Publish** (`.forgejo/workflows/docker-publish.yml`):
- Push to `master` → builds and pushes `ghcr.io/ebrakke/group-chat:dev`
- Push a version tag (`v*`) → builds and pushes `ghcr.io/ebrakke/group-chat:latest` + `ghcr.io/ebrakke/group-chat:v1.2.3`
- Version tags pass `--build-arg VERSION=v1.2.3` so `relay-chat --version` shows the real version

### Releasing to Production

```bash
# 1. Develop on master — each push builds :dev image
git push origin master

# 2. Test on dev Once instance (pulls :dev)

# 3. When satisfied, tag a release:
git tag v1.2.3
git push --tags

# This builds :latest + :v1.2.3 — prod Once instance picks up :latest
```

### Deployment

Deployed via ONCE (Basecamp) using `Dockerfile.once`:
- **Dev instance**: pulls `ghcr.io/ebrakke/group-chat:dev` (every master push)
- **Prod instance**: pulls `ghcr.io/ebrakke/group-chat:latest` (only version tags)
- Port 80, persistent storage at `/storage`
- Health check: `GET /up`
- Backup hooks in `deploy/once/hooks/` (pre-backup flushes WAL, post-restore cleans stale files)

Docker build (`Dockerfile.once`):
- Stage 1: Bun 1.3.9 Alpine → frontend build
- Stage 2: Go 1.25 Alpine → binary build (CGO_ENABLED=0, pure Go)
- Stage 3: Alpine 3.20 → minimal runtime image

### Go Service Layer

| Package    | Key Exports                                                    |
|------------|----------------------------------------------------------------|
| `api`      | `New(auth, bots, channels, messages, reactions, hub)`, `ServeHTTP()` |
| `auth`     | `HasUsers`, `Bootstrap`, `Signup`, `Login`, `Logout`, `ValidateSession`, `CreateInvite`, `ListInvites`, `ListUsers`, `SearchUsers`, `ResetPassword`, `GetUserByID` |
| `bots`     | `Create`, `List`, `GetByID`, `Delete`, `GenerateToken`, `ValidateToken`, `ListTokens`, `RevokeToken`, `BindChannel`, `UnbindChannel`, `ListBindings`, `GetBoundChannelIDs`, `CanWrite` |
| `channels` | `EnsureGeneral`, `Create`, `GetByID`, `GetByName`, `List`, `AddMember`, `ListMembers`, `IsMember` |
| `messages` | `Create`, `CreateReply`, `GetByID`, `Edit`, `Delete`, `ListChannel`, `ListThread`, `ListUserThreads` |
| `reactions` | `Toggle`, `Add`, `Remove`, `SummaryForMessages`              |
| `ws`       | `NewHub`, `Handler`, `Broadcast`, `AuthResult`                 |
| `db`       | `Open(path)` → runs migrations, returns `*DB`                 |

Allowed reaction emoji (hardcoded): `👍 👎 ❤️ 😂 😮 😢 🔥 🎉 👀 🙏`
