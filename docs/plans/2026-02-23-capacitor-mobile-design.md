# Capacitor Mobile App Design

## Goal

Turn relay-chat into a native Android app using Capacitor, enabling native push notifications (via self-hosted ntfy), camera/file access, and other native capabilities — without maintaining a separate codebase.

## Decisions

- **Platform:** Android only
- **Framework:** Capacitor (wraps existing vanilla JS SPA in native WebView)
- **Push notifications:** Embedded ntfy client (admin hosts ntfy server, no user setup required)
- **Server config:** Configurable at login (one APK works with any relay-chat instance)
- **Distribution:** APK / F-Droid (no Google Play Store)
- **No Google/Firebase dependency**

## Architecture

### Server URL Configuration

The native app can't use relative URLs since it runs from local files. On native:

1. App opens → check `localStorage` for saved server URL
2. If no server → show server URL screen (text input + "Connect" button)
3. Validate by hitting `{url}/api/health`
4. If server set → check saved session → attempt `/api/auth/me`
5. If session valid → main chat; if invalid → login screen

Web PWA continues using relative URLs unchanged. Branching via `Capacitor.isNativePlatform()`.

### API Base URL Abstraction

All `fetch('/api/...')` calls become `fetch(`${getApiBase()}/api/...`)`:

```js
function getApiBase() {
  if (window.Capacitor?.isNativePlatform()) {
    return localStorage.getItem('serverUrl') || '';
  }
  return '';
}
```

WebSocket URL derived similarly from the configured server host.

### CORS

Backend adds CORS middleware accepting `capacitor://localhost` and `http://localhost` origins. Configurable via env var or app_settings. Only activates for cross-origin requests.

### Push Notifications via Embedded ntfy

**Flow:**
1. Admin self-hosts ntfy server, configures URL in relay-chat admin settings
2. User logs in on native app → app generates unique topic (`rc-{userId}-{deviceId}`)
3. App registers topic with relay-chat server via `POST /api/notifications/device`
4. App subscribes to topic using ntfy's embedded Android library
5. On message → server POSTs to `{ntfyUrl}/{topic}` → ntfy delivers → native notification
6. Tap notification → deep link to channel/thread

**Backend:**
- New `NtfyProvider` in `internal/notifications/` implementing existing `Provider` interface
- HTTP POST to `{ntfyUrl}/{topic}` with title/message/click URL
- Admin setting: `ntfy_url` in `app_settings`

**Database:**
```sql
CREATE TABLE device_push_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  push_topic TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'ntfy',
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(user_id, device_id)
);
```

**API:**
- `POST /api/notifications/device` — register device push topic
- `DELETE /api/notifications/device` — unregister current device

Device push is additive — sent alongside the user's existing notification preference (webhook/pushover).

**Notification payload:**
```json
{
  "topic": "relay-chat",
  "title": "#general - Bob",
  "message": "Hey @alice check this out",
  "click": "relaychat://channel/1/thread/123"
}
```

**Background reliability:** ntfy's Android library uses a foreground service with persistent connection. Admin can optionally configure FCM on their ntfy server for battery-efficient delivery.

## Project Structure

```
relay-chat/
├── frontend/              # Existing web SPA source
│   ├── src/
│   └── build.js
├── mobile/                # NEW — Capacitor project
│   ├── capacitor.config.ts
│   ├── android/           # Generated Android project
│   ├── package.json       # Capacitor deps + plugins
│   └── ...
├── cmd/app/
│   └── static/            # Embedded web assets (unchanged)
├── internal/              # Go backend (+ new ntfy provider)
└── Makefile               # Updated with mobile targets
```

Capacitor's `webDir` points to `../frontend/dist/`. Same build output serves both web and native.

### Capacitor Plugins

- `@capacitor/push-notifications` — handle received notifications, local notification display
- `@capacitor/camera` — photo capture and library access
- `@capacitor/filesystem` — file read/write for downloads/sharing
- `@capacitor/share` — native share sheet
- `@capacitor/app` — lifecycle events, deep linking, back button
- ntfy Android library or custom Capacitor plugin for ntfy subscription

### Build Flow

```
make mobile-build:
  1. cd frontend && bun run build
  2. cd mobile && npx cap sync android
  3. cd mobile/android && ./gradlew assembleDebug
```

## Frontend Changes

1. **API base URL abstraction** — `getApiBase()` function, all fetch/WS calls use it
2. **Server URL config screen** — new `renderServerConfig()`, shown on native before login
3. **WebSocket URL derivation** — `getWsUrl()` handles both web and native
4. **Push registration** — on login, register with ntfy + server; on logout, unregister
5. **Native features (progressive):**
   - Camera: photo button in composer → `Camera.getPhoto()` → upload
   - Share: long-press message → native share sheet
   - Deep links: `relaychat://channel/{id}/thread/{id}`
   - Back button: `App.addListener('backButton')` → navigation stack
6. **Capacitor JS integration** — `@capacitor/core` import, bundled by Bun

All rendering, state management, WebSocket handling, markdown, reactions, threads stay unchanged.

## Backend Changes

1. **CORS middleware** — accept cross-origin from Capacitor app
2. **NtfyProvider** — new notification provider, HTTP POST to ntfy endpoints
3. **device_push_tokens table** — store per-device push topics
4. **Device registration API** — register/unregister endpoints
5. **Notification routing update** — send to device push topics in addition to user's provider preference
6. **Image/file upload (Phase 3)** — `POST /api/channels/{id}/upload`, multipart, disk storage

## Phased Rollout

### Phase 1 — Capacitor Shell + Server Config (MVP)
- Set up Capacitor project structure
- Add server URL configuration screen
- Abstract all API/WS URLs with base URL support
- Add CORS middleware to backend
- Build APK that connects to any relay-chat instance
- **Result:** working chat app on Android, functional but no native features yet

### Phase 2 — Push Notifications via ntfy
- Add `device_push_tokens` table and API endpoints
- Implement `NtfyProvider` in backend
- Embed ntfy subscription in Android app
- Deep link from notification taps to correct channel/thread
- **Result:** native push notifications, no Pushover needed for mobile users

### Phase 3 — Native Features
- Camera integration for photo messages
- File upload API + storage
- Native share sheet
- Back button handling / navigation improvements
- **Result:** full native experience
