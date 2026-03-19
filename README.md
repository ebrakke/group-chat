# Relay Chat

A self-hosted, private group chat for small teams. Single Go binary, no external dependencies, runs anywhere.

Built on [Nostr](https://nostr.com) infrastructure (NIP-29) with a modern SvelteKit frontend embedded right in the binary.

## Features

- **Channels & Threads** — Organize conversations by topic, reply in threads to keep things focused
- **Real-time** — WebSocket-powered instant messaging with connection recovery
- **Reactions** — Emoji reactions with hover tooltips showing who reacted
- **Search** — Full-text search across all messages (SQLite FTS5)
- **File Uploads** — Drag-and-drop file sharing with previews (10MB max)
- **Link Previews** — Automatic Open Graph metadata for shared URLs
- **Markdown** — Full markdown support in messages (code blocks, tables, lists, etc.)
- **@Mentions** — Tag users with autocomplete, get notified
- **Themes** — 5 built-in themes: Parchment, Terminal, Midnight, Dracula, Solarized
- **Bots** — Create bot users with scoped channel permissions and API tokens
- **Notifications** — Push via Web Push (PWA) or webhook
- **PWA** — installable Progressive Web App with push notifications
- **Profile Sidebar** — Click any avatar to see user details in a resizable side panel
- **Invite System** — Admin-controlled invites with optional expiry and usage limits
- **Nostr Relay** — Embedded NIP-29 relay at `/relay` for protocol compatibility

## Quick Start

**Prerequisites:** [Go 1.24+](https://go.dev) and [Bun](https://bun.sh)

```bash
git clone <repo-url> && cd relay-chat
make dev
```

Visit http://localhost:8080 — an admin account (`admin`/`admin`) is created automatically in dev mode.

### Windows (PowerShell)

If `make` is not available, use the included script:

```powershell
.\dev.ps1
```

Ensure [Go](https://go.dev/dl/) and [Bun](https://bun.sh) are installed and on your PATH (or the script will add default install locations). The app listens on `http://localhost:8080`; if the browser cannot connect, check that no firewall is blocking port 8080.

For production, build a single binary:

```bash
make build
DATA_DIR=/var/lib/relay-chat ./relay-chat
```

First visitor creates the admin account. Invite others from Settings.

## Docker

```bash
docker build -f Dockerfile.fly -t relay-chat .
docker run -p 8080:8080 -v relay-data:/data relay-chat
```

## Android App

Build a debug APK that connects to your server:

```bash
make mobile-build URL=https://chat.example.com
# APK at: mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The app runs a foreground service to keep the WebSocket alive for real-time notifications, even when backgrounded.

## Architecture

```
Single Go Binary
├── HTTP Server (stdlib net/http)
│   ├── /api/*     JSON REST API
│   ├── /ws        WebSocket (real-time events)
│   ├── /relay     NIP-29 Nostr relay
│   └── /*         Embedded SPA (SvelteKit)
├── SQLite         App database (users, channels, messages)
└── Badger         Relay store (Nostr events; pure Go, no cgo)
```

**Backend:** Go, SQLite (modernc.org/sqlite — pure Go, no cgo) for the app; Badger for the embedded NIP-29 relay (pure Go); khatru29 for relay logic

**Frontend:** SvelteKit 5 (runes), Tailwind CSS v4, TypeScript, built with Bun, embedded in the Go binary via `//go:embed`

## Development

```bash
make dev          # Build + start on :8080 (auto-creates admin/admin)
make build        # Full build (frontend + Go binary)
make test         # Go unit tests
make test-e2e     # Playwright E2E tests
make release VERSION=0.1.0  # Multi-platform release binaries
```

For frontend development with hot reload:

```bash
cd frontend && bun run dev    # Vite dev server on :5173, proxies API to :8080
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `DATA_DIR` | `/data` | Directory for SQLite databases |
| `DEV_MODE` | - | Auto-create admin/admin if no users exist |
| `RELAY_DOMAIN` | `localhost` | Nostr relay domain |

## License

MIT
