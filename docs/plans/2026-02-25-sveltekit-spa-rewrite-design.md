# SvelteKit SPA/PWA Rewrite Design

## Summary

Rewrite the relay-chat frontend from vanilla JavaScript (~2500 lines) to a SvelteKit 5 SPA with TailwindCSS v4. The Go backend remains unchanged. Built with Bun, served as static files embedded in the single Go binary.

## Decisions

- **Full rewrite** of frontend (not incremental migration)
- **Static SPA** via `adapter-static` with `fallback: 'index.html'` — no SSR, no Node runtime at deploy
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) as primary reactivity model
- **Tailwind v4** with CSS-first configuration and `@tailwindcss/vite` plugin
- **Fresh visual design** — dark theme, but not pixel-matching current UI
- **Mobile loads from server** (Capacitor points to server URL, not bundled)
- **TypeScript** throughout
- **No Go backend changes** — API stays identical

## Project Structure

```
frontend/
├── package.json
├── svelte.config.js          # adapter-static, SPA fallback
├── vite.config.ts             # Vite + proxy config for dev
├── src/
│   ├── app.html               # HTML shell
│   ├── app.css                # Tailwind imports + theme
│   ├── routes/
│   │   ├── +layout.svelte     # Root layout: auth guard, WS, sidebar
│   │   ├── +layout.ts         # ssr = false
│   │   ├── +page.svelte       # Redirect to /channels or /login
│   │   ├── login/+page.svelte
│   │   ├── bootstrap/+page.svelte
│   │   ├── signup/+page.svelte
│   │   ├── channels/
│   │   │   ├── +layout.svelte # Channel list sidebar + main area
│   │   │   ├── +page.svelte   # "Select a channel" placeholder
│   │   │   └── [id]/+page.svelte
│   │   └── settings/+page.svelte
│   ├── lib/
│   │   ├── api.ts             # Fetch wrapper with auth
│   │   ├── ws.ts              # WebSocket manager
│   │   ├── stores/
│   │   │   ├── auth.ts        # Current user
│   │   │   ├── channels.ts    # Channels + unread
│   │   │   ├── messages.ts    # Messages per channel
│   │   │   └── threads.ts     # Thread state
│   │   ├── components/
│   │   │   ├── Sidebar.svelte
│   │   │   ├── MessageList.svelte
│   │   │   ├── MessageInput.svelte
│   │   │   ├── Message.svelte
│   │   │   ├── ThreadPanel.svelte
│   │   │   ├── ReactionPicker.svelte
│   │   │   ├── MentionAutocomplete.svelte
│   │   │   ├── LinkPreview.svelte
│   │   │   └── Modal.svelte
│   │   └── utils/
│   │       ├── markdown.ts    # Marked.js wrapper
│   │       ├── time.ts        # Time formatting
│   │       └── platform.ts    # Capacitor detection
│   └── service-worker.ts      # PWA service worker
├── static/
│   ├── manifest.json
│   ├── icon-192.png
│   └── icon-512.png
└── dist/                      # Build output
```

## Build Pipeline

- `bun run build` → Vite builds to `frontend/dist/`
- Makefile `frontend` target: `cd frontend && bun install && bun run build`, copy `dist/*` to `cmd/app/static/`
- Content-hash filenames handled by Vite (replaces custom `build.js`)
- Dev: `bun run dev` → Vite dev server (port 5173) proxies `/api` and `/ws` to Go backend (port 8080)

## SvelteKit Configuration

- `adapter-static` with `fallback: 'index.html'` for SPA mode
- All routes: `export const ssr = false` via root `+layout.ts`
- Vite dev server proxies `/api/*` and `/ws` to `http://localhost:8080`

## Auth Flow

- Root `+layout.svelte` checks auth on mount via `GET /api/auth/me`
- No user → redirect to `/login` (or `/bootstrap` if `GET /api/auth/has-users` returns false)
- Auth token: cookie for web, localStorage + Bearer header for native (Capacitor)

## WebSocket

- `ws.ts`: single connection, reconnect with exponential backoff
- Connects after successful auth
- Events dispatched to relevant stores
- Managed via `$effect` in root layout

## Data Flow

```
API fetch → $state in store → components react via $derived
WebSocket event → update store $state → components auto-update
User action → API call → optimistic $state update → confirm via WS
```

## PWA

- `manifest.json` in `static/`: standalone display, dark theme
- `src/service-worker.ts` using SvelteKit's `$service-worker` module
- Cache strategy: build assets cache-first, API/WS network-only, navigation network-first with fallback

## Capacitor

- `platform.ts` detects native platform via `Capacitor.isNativePlatform()`
- Server URL from localStorage (native) or current origin (web)
- Push notification registration preserved
- CORS already configured in Go backend

## Component Details

| Component | Responsibility |
|-----------|---------------|
| `Sidebar.svelte` | Channel list, unread badges, create channel button, user info |
| `MessageList.svelte` | Scrollable message feed, auto-scroll, load more |
| `Message.svelte` | Single message: markdown, reactions, link previews, reply count |
| `MessageInput.svelte` | Text input with @mention autocomplete, send button |
| `ThreadPanel.svelte` | Slide-in panel (desktop) or full-screen (mobile) for thread replies |
| `ReactionPicker.svelte` | Emoji selection popup |
| `MentionAutocomplete.svelte` | User search dropdown triggered by @ |
| `LinkPreview.svelte` | OpenGraph preview card |
| `Modal.svelte` | Reusable modal dialog |

## Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Bootstrap | `/bootstrap` | Create first admin account |
| Login | `/login` | Username/password login |
| Signup | `/signup?code=xxx` | Register with invite code |
| Chat | `/channels/[id]` | Main chat view with sidebar |
| Settings | `/settings` | Notification prefs, invites, bots, admin |
