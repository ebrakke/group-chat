# Relay Chat

A self-hosted, private group chat app built on Nostr infrastructure. Think "Slack for your homelab" — channels, threads, file sharing, and reactions — all running on the open Nostr protocol with no SaaS dependency. Own your data, control your community.

## Tech Stack

**Frontend & API:**
- SvelteKit + Svelte 5 (runes)
- SvelteKit API routes (server-side endpoints)
- Tailwind CSS
- TypeScript
- better-sqlite3 (SQLite)
- nostr-tools (Nostr protocol)

**Infrastructure:**
- khatru29 (NIP-29 group relay, Go)
- Blossom (file storage)
- Docker Compose

## Running Locally

```bash
# Start all services (frontend with API, relay, blossom)
docker compose -f docker-compose.dev.yml up -d --build

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down
```

Services will be available at:
- App (Frontend + API): http://localhost:3002
- Relay: ws://localhost:3336
- Blossom: http://localhost:3337

**First run:** Visit http://localhost:3002 to create the first admin account (no invite required).

## Deploying to Fly.io

```bash
# Login to Fly
fly auth login

# Deploy
fly deploy

# View logs
fly logs

# Open in browser
fly open
```

Make sure `fly.toml` is configured with your app name and secrets are set:

```bash
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
fly secrets set KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
```

## Contributing

We use a PR-based workflow. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on:
- Creating feature branches
- Running tests
- Code review process
- PR checklist

## Project Structure

```
relay-chat/
├── frontend/      # SvelteKit app (frontend + API routes)
│   ├── src/routes/        # Pages and UI components
│   ├── src/routes/api/    # API endpoints (SvelteKit server routes)
│   └── src/lib/server/    # Server-side utilities and database
├── relay/         # khatru29 relay (Go) - NIP-29 group relay
├── tests/e2e/     # Playwright end-to-end tests
├── docs/          # Documentation
└── fly.toml       # Fly.io deployment config (unified app)
```

## Architecture

Relay Chat uses a **unified SvelteKit architecture**:
- **Frontend**: Svelte 5 components with runes for reactive state
- **API**: SvelteKit server routes in `/frontend/src/routes/api/`
- **WebSocket**: Handled through SvelteKit endpoints
- **Database**: SQLite with better-sqlite3
- **Nostr Relay**: Separate khatru29 Go service for NIP-29 groups
- **File Storage**: Separate Blossom server

This unified approach eliminates the need for a separate API server while maintaining clean separation between client and server code.

## Documentation

- [Development Principles](./docs/development.md) - Core development guidelines

## Security

- Passwords are hashed with bcrypt
- Nostr private keys are AES-256-GCM encrypted
- Sessions use 256-bit random tokens (30-day expiry)
- **IMPORTANT:** Set strong secrets in production!

## License

MIT
