# Relay Chat

Self-hosted, private group chat powered by [Nostr](https://nostr.com). Think "Slack for your homelab" — channels, threads, file sharing — but built on an open protocol with no SaaS dependency.

## Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌─────────┐
│ Frontend │────▶│ API      │────▶│ Nostr Relay  │     │ Blossom │
│ SvelteKit│     │ Hono/Node│     │ khatru29/Go  │     │ (files) │
│ :3000    │     │ :4000    │     │ :3334        │     │ :3335   │
└──────────┘     └──────────┘     └──────────────┘     └─────────┘
                      │                                      ▲
                      │              SQLite                   │
                      │           (users, sessions,          │
                      │            invites)                   │
                      └──────────────────────────────────────┘
                              file upload proxy
```

- **Frontend** — SvelteKit + Tailwind + shadcn-svelte. Talks to the API over REST + WebSocket.
- **API** — Node.js + Hono. The only client that talks to the Nostr relay. Manages auth, translates between app concepts and Nostr events.
- **Relay** — Go binary wrapping [relay29](https://github.com/fiatjaf/relay29) (NIP-29 group relay with NIP-42 AUTH).
- **Blossom** — [hzrd149/blossom-server](https://github.com/hzrd149/blossom-server) for file/image storage.

Users never see or touch Nostr. The API server abstracts it completely.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/ebrakke/relay-chat.git
cd relay-chat

# Start all services
docker compose up --build

# Visit http://localhost:3000
# First user to sign up becomes admin (no invite needed)
```

## Development

### Frontend
```bash
cd frontend && npm install && npm run dev
```

### API
```bash
cd api && npm install && npm run dev
```

### Relay
```bash
cd relay && go run .
```

## Spec

See [relay-chat-v1-spec.md](./docs/relay-chat-v1-spec.md) for the full product specification.

## License

MIT
