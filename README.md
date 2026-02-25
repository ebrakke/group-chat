# Relay Chat

A self-hosted, private group chat app built on Nostr infrastructure. Single Go binary embedding a NIP-29 relay, JSON API, WebSocket endpoint, and static SPA frontend.

> **⚠️ IMPORTANT: This project uses [Bun](https://bun.sh), NOT npm/yarn/pnpm. All frontend build commands use `bun`.**

## Architecture

```
cmd/app/main.go          # Entrypoint: stdlib net/http mux
internal/
  relay/                  # NIP-29 khatru29 relay (importable package)
  db/                     # SQLite + numbered migrations (modernc.org/sqlite, pure-Go)
  auth/                   # Users, sessions, invites (argon2id)
  channels/               # Channel CRUD + membership
  api/                    # JSON API handlers (/api/*)
  ws/                     # WebSocket stub (/ws)
frontend/                 # Minimal SPA (bun build)
  src/
    app.js                # Main application logic
    markdown.js           # Markdown rendering (marked.js wrapper)
    style.css             # Styles with markdown support
  build.js                # Bun bundler with content-hash cache busting
relay/                    # Original relay entrypoint (preserved)
```

## Routes

| Path | Handler |
|------|---------|
| `/api/*` | JSON API (auth, channels, invites, users) |
| `/ws` | WebSocket stub |
| `/relay` | NIP-29 relay (WebSocket) |
| `/*` | SPA static assets (falls back to index.html) |

## Features

### Markdown Support

Messages support full markdown rendering via `marked.js`:

- **Headers** (h1-h6) with GitHub-style underlines
- **Text formatting**: bold, italic, inline code
- **Code blocks** with syntax preservation
- **Blockquotes** with left border styling
- **Lists**: ordered and unordered
- **Links**: open in new tab with security attributes
- **Tables** with proper borders
- **Images**: responsive, max-width 100%
- **Horizontal rules**

Implementation: `frontend/src/markdown.js` wraps marked.js with security defaults (noopener/noreferrer on links). Messages are rendered via `renderMarkdown()` in `app.js`.

### Notifications

Get mobile push notifications when:
- Someone @mentions you
- Someone replies to a thread you're in
- All messages (optional)

**Setup (Admin):**

For simplified Pushover setup:
1. Create a Pushover application at https://pushover.net/apps/build
2. In Relay Chat admin settings, enter your Pushover app token
3. Save (provider reloads automatically, no restart required)

**Setup (Users):**

If Pushover is enabled:
- Go to Settings → Notifications
- Select "Pushover"
- Enter your Pushover user key from https://pushover.net
- Configure notification preferences
- Save

For custom webhooks:
- Go to Settings → Notifications
- Select "Custom Webhook"
- Enter your webhook URL (e.g., ntfy.sh, custom endpoint)
- Configure notification preferences
- Save

**Notification Payload:**

Webhooks receive JSON with:
```json
{
  "title": "@you mentioned in #general",
  "message": "Hey @alice check this out",
  "sender": "Bob",
  "channel": "general",
  "channelId": 1,
  "url": "https://chat.example.com/#/channel/1/thread/123",
  "timestamp": "2026-02-17T12:34:56Z",
  "notificationType": "mention",
  "threadContext": "Re: previous message..."
}
```

**Thread Muting:**

Mute busy threads to stop getting notifications. Click the 🔕 icon in the thread header.

## Quick Start

**Prerequisites:** Install [Bun](https://bun.sh) and Go 1.21+

```bash
# Build frontend (bundles app.js + markdown.js + marked library)
# ⚠️ ALWAYS use 'bun', NEVER use 'npm'
cd frontend && bun install && bun run build && cd ..

# Copy static assets
cp frontend/dist/* cmd/app/static/

# Run (uses /data by default, override with DATA_DIR)
DATA_DIR=./tmp go run ./cmd/app/

# Or build and run
go build -o relay-chat ./cmd/app/
DATA_DIR=./tmp ./relay-chat
```

Visit http://localhost:8080. First visitor creates the admin account.

## Dev Commands

**⚠️ All frontend commands use `bun`, NOT `npm`**

```bash
# Run Go tests
go test ./internal/...

# Run E2E tests (builds, starts server, runs Playwright)
./scripts/run-e2e.sh

# Build frontend only (uses bun)
cd frontend && bun run build

# Install frontend dependencies (uses bun)
cd frontend && bun install

# Build Go binary only
go build -o relay-chat ./cmd/app/
```

## Auth System

- **Passwords**: argon2id hashed
- **Sessions**: HTTP-only cookie, 30-day expiry
- **Bootstrap**: First user auto-becomes admin
- **Invites**: Admin creates invite tokens (optional expiry + max uses)
- **Roles**: `admin` (full control) / `member` (standard access)
- **Usernames**: Unique forever, immutable; display names are mutable

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | - | Health check |
| GET | `/api/auth/has-users` | - | Check if bootstrap needed |
| POST | `/api/auth/bootstrap` | - | Create first admin |
| POST | `/api/auth/login` | - | Login |
| POST | `/api/auth/logout` | yes | Logout |
| POST | `/api/auth/signup` | - | Signup with invite code |
| GET | `/api/auth/me` | yes | Current user |
| POST | `/api/invites` | admin | Create invite |
| GET | `/api/invites` | admin | List invites |
| GET | `/api/channels` | yes | List channels |
| GET | `/api/users` | admin | List users |
| POST | `/api/users/{id}/reset-password` | admin | Reset user password |
| GET | `/api/notifications/settings` | yes | Get notification settings |
| POST | `/api/notifications/settings` | yes | Update notification settings |
| POST | `/api/threads/{id}/mute` | yes | Mute thread notifications |
| DELETE | `/api/threads/{id}/mute` | yes | Unmute thread notifications |
| GET | `/api/threads/{id}/mute` | yes | Check thread mute status |
| GET | `/api/notifications/providers` | yes | List available notification providers |
| GET | `/api/admin/settings` | admin | Get server-wide settings |
| POST | `/api/admin/settings` | admin | Update server-wide settings |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `DATA_DIR` | `/data` | Directory for SQLite databases |
| `DATABASE_PATH` | `$DATA_DIR/app.db` | App database path |
| `RELAY_DATABASE_PATH` | `$DATA_DIR/relay.db` | Relay database path |
| `RELAY_PRIVKEY` | auto-generated | Relay private key (hex) |
| `RELAY_DOMAIN` | `localhost` | Relay domain |

## License

MIT
