# Relay Chat

A self-hosted, private group chat app built on Nostr infrastructure. Think "Slack for your homelab" — channels, threads, file sharing, and reactions — all running on the open Nostr protocol with no SaaS dependency. Own your data, control your community.

## Tech Stack

**Frontend:**
- SvelteKit + Svelte 5 (runes)
- Tailwind CSS
- TypeScript

**Backend:**
- Hono (API server)
- better-sqlite3 (SQLite)
- nostr-tools (Nostr protocol)
- TypeScript

**Infrastructure:**
- khatru29 (NIP-29 group relay, Go)
- Blossom (file storage)
- Docker Compose

## Running Locally

```bash
# Start all services (frontend, api, relay, blossom)
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

Services will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- Relay: ws://localhost:3334
- Blossom: http://localhost:3335

**First run:** Visit http://localhost:3000 to create the first admin account (no invite required).

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
├── api/           # Hono API server (TypeScript)
├── frontend/      # SvelteKit frontend (Svelte 5)
├── relay/         # khatru29 relay (Go) - NIP-29 group relay
├── docs/          # Documentation
└── fly.toml       # Fly.io deployment config
```

## Documentation

- [Development Principles](./docs/development.md) - Core development guidelines

## Security

- Passwords are hashed with bcrypt
- Nostr private keys are AES-256-GCM encrypted
- Sessions use 256-bit random tokens (30-day expiry)
- **IMPORTANT:** Set strong secrets in production!

## License

MIT
