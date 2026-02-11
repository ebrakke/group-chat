# Relay Chat

A self-hosted, private group chat app built on Nostr infrastructure. Think "Slack for your homelab" — channels, threads, file sharing — but built on an open protocol with no SaaS dependency.

## Project Status

### ✅ Sprint 1 - Auth + First Channel (COMPLETE)

Sprint 1 has been fully implemented with the following features:

**Backend (API):**
- ✅ Database schema with SQLite (users, sessions, invites, channels)
- ✅ First-user bootstrap (no invite required, becomes admin automatically)
- ✅ User signup with Nostr keypair generation
- ✅ Encrypted private key storage (AES-256-GCM)
- ✅ Login/logout with bcrypt password hashing
- ✅ Session management (Bearer token auth, 30-day sliding expiry)
- ✅ Invite code generation and validation
- ✅ Admin-only invite management
- ✅ Channel creation and listing
- ✅ Auto-creation of #general channel on first startup
- ✅ Nostr relay connection with NIP-42 AUTH support
- ✅ Channel metadata publishing (kind 39000, NIP-29)
- ✅ Proper NIP-29 event validation (no kind 0 on group relay)

**Frontend:**
- ✅ Login page with authentication
- ✅ First-user signup (no invite required)
- ✅ Invite-based signup page with code validation
- ✅ Main chat interface with channel sidebar
- ✅ Admin panel for invite management
- ✅ User profile display
- ✅ Logout functionality

**What's Working:**
- Can visit /login and see login form
- First user can sign up at / without invite, becomes admin
- #general channel is auto-created on first startup
- Subsequent users need invite links
- Admin can generate and revoke invite links
- Users can log in/out
- Main page shows channel sidebar with #general listed
- Nostr keypair is generated and encrypted for each user
- Server connects to relay and publishes events

## Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│   SvelteKit     │◄────►│  Hono API    │◄────►│  khatru29       │
│   Frontend      │      │  Server      │      │  Relay          │
│   (Port 3000)   │      │  (Port 4000) │      │  (Port 3334)    │
└─────────────────┘      └──────┬───────┘      └─────────────────┘
                                │
                                │
                         ┌──────▼───────┐
                         │  SQLite DB   │
                         │  (Auth data) │
                         └──────────────┘
```

## Quick Start

### Prerequisites

- Node.js v22+
- A running Nostr relay (khatru29 or compatible NIP-29 relay)

### Setup API

```bash
cd api

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Edit .env and set your values:
# - SESSION_SECRET (random 64-char string)
# - KEY_ENCRYPTION_SECRET (random 64-char string)
# - RELAY_URL (ws://your-relay:3334)

# Run in development
npm run dev

# Or build and run production
npm run build
npm start
```

The API server will:
1. Initialize the SQLite database
2. Connect to the Nostr relay
3. Create the #general channel (if it doesn't exist)
4. Listen on port 4000

### Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Edit .env and set VITE_API_URL if needed

# Run in development
npm run dev

# Or build for production
npm run build
npm run preview
```

The frontend will be available at http://localhost:3000

### First Run

1. Visit http://localhost:3000
2. You'll see the first-user signup form (no invite required)
3. Create your admin account
4. You'll be redirected to the main chat interface
5. #general channel will be listed in the sidebar

### Generating Invite Links

As an admin:
1. Click "Admin Panel" in the sidebar
2. Click "Generate Invite"
3. Copy the invite URL and share it
4. New users can sign up using that link

### Docker Compose Deployment

For production or easy local deployment, use Docker Compose:

```bash
# Start all services (frontend, api, relay, blossom)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Important:** Before running, update the secrets in `docker-compose.yml`:
- Change `SESSION_SECRET` and `KEY_ENCRYPTION_SECRET` to random 64-character strings
- Optionally set `RELAY_PRIVKEY` (will be auto-generated if empty)

Services will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- Relay: ws://localhost:3334
- Blossom: http://localhost:3335

## Project Structure

```
relay-chat/
├── api/                    # Hono API server (TypeScript)
│   ├── src/
│   │   ├── db/            # SQLite database schema
│   │   ├── lib/           # Core logic (users, invites, channels, crypto)
│   │   ├── middleware/    # Auth middleware
│   │   ├── nostr/         # Nostr client (WebSocket connection)
│   │   ├── routes/        # API route handlers
│   │   └── index.ts       # Server entry point
│   └── package.json
├── frontend/              # SvelteKit frontend (Svelte 5)
│   ├── src/
│   │   ├── routes/        # Pages (login, invite, main, admin)
│   │   └── lib/           # Shared utilities
│   └── package.json
├── relay/                 # khatru29 relay (Go) - NIP-29 group relay
└── docker-compose.yml     # Full stack deployment (Docker Compose)
```

## API Endpoints

### Auth
- `POST /api/v1/auth/signup` - Create account (first user = admin, no invite required)
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Invites
- `GET /api/v1/invites/:code` - Validate invite code
- `POST /api/v1/invites` - Generate invite (authenticated)
- `GET /api/v1/invites` - List invites (admin only)
- `DELETE /api/v1/invites/:code` - Revoke invite (admin only)

### Channels
- `GET /api/v1/channels` - List all channels
- `POST /api/v1/channels` - Create channel (admin only)
- `PATCH /api/v1/channels/:id` - Update channel (admin only)
- `DELETE /api/v1/channels/:id` - Delete channel (admin only, cannot delete #general)

## Technology Stack

**Backend:**
- Hono - Fast web framework
- better-sqlite3 - SQLite database
- bcrypt - Password hashing
- nostr-tools - Nostr protocol library
- TypeScript

**Frontend:**
- SvelteKit - Full-stack framework
- Svelte 5 - UI framework with runes
- Tailwind CSS - Styling
- TypeScript

**Infrastructure:**
- Nostr (NIP-29) - Group messaging protocol
- khatru29 - NIP-29 relay (Go-based, included)
- Blossom - File storage server (optional)
- Docker Compose - Container orchestration

## Security Notes

- Passwords are hashed with bcrypt (10 rounds)
- Nostr private keys are encrypted with AES-256-GCM before storage
- Sessions use 256-bit random tokens with 30-day expiry
- Server-to-relay communication uses NIP-42 AUTH
- **IMPORTANT:** Change `SESSION_SECRET` and `KEY_ENCRYPTION_SECRET` in production!

## Roadmap

### Sprint 2 - Messaging (Next)
- Send and receive messages in channels
- Real-time message delivery via WebSocket
- Message editing and deletion
- Markdown rendering

### Sprint 3 - Threads + Reactions
- Thread creation and replies
- Emoji reactions
- Thread panel UI

### Sprint 4 - File Uploads + Channels
- File upload via Blossom
- Image previews
- Channel management UI

### Sprint 5 - Admin + Polish
- User management
- Role management
- Settings panel
- Mobile responsive design

### Sprint 6 - Hardening
- Security audit
- Performance optimization
- End-to-end testing
- v1.0 release

## Development

### Building

```bash
# Build API
cd api && npm run build

# Check frontend
cd frontend && npm run check

# Build frontend
cd frontend && npm run build
```

### Linting & Type Checking

```bash
# API
cd api && npx tsc --noEmit

# Frontend
cd frontend && npm run check
```

## Contributing

This is a personal project built as a learning exercise for Nostr and NIP-29. Feel free to fork and experiment!

## License

MIT

## Acknowledgments

- Built on [Nostr](https://nostr.com) protocol
- Uses [nostr-tools](https://github.com/nbd-wtf/nostr-tools) library
- Inspired by Slack, Discord, and the self-hosting community
