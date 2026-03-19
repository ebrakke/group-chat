# Onboarding UX — QR Login, PWA Install Prompt, Invite Visibility

**Date:** 2026-03-18
**Status:** Draft

## Summary

Unified onboarding experience with three features: QR code session transfer for mobile login, PWA install prompt on mobile browsers, and improved invite link visibility after bootstrap and in the sidebar.

## 1. QR Code Login (Settings Page)

### User Flow

1. Logged-in user opens Settings on desktop
2. New "Log in on another device" section shows a QR code
3. QR encodes `{baseUrl}/auth/transfer/{token}`
4. User scans QR with phone browser
5. Server validates one-time token, creates session, sets cookie
6. Phone redirects to `/channels` — user is logged in
7. Token is consumed (deleted) immediately

### Backend

**New table** (migration 020):
```sql
CREATE TABLE IF NOT EXISTS transfer_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfer_tokens_token ON transfer_tokens(token);
```

**New endpoints:**
- `POST /api/auth/transfer-token` (authenticated) — generates a random 32-byte hex token, stores with 5-minute expiry, returns `{ token, url }`. Cleans up any existing tokens for the user first (max 1 active per user).
- `GET /auth/transfer/{token}` (unauthenticated, NOT under `/api/`) — validates token exists and is not expired, creates a new session for the associated user, sets the session cookie, deletes the token, redirects to `/channels`. Returns 410 Gone if token is expired or already used.

**Token lifecycle:**
- Generated on demand when settings page loads the QR section
- Expires after 5 minutes
- Single use (deleted on consumption)
- Old tokens for the same user are cleaned up on new token generation
- Expired tokens cleaned up lazily (on generation or via the validation check)

### Frontend

**Settings page** — new section after the account section (visible to all users):
- Heading: "Log in on another device"
- Subtext: "Scan this QR code with your phone to log in instantly"
- QR code rendered client-side from the URL (use a lightweight library like `qrcode` npm package, or inline SVG generation)
- Auto-refreshes token every 4 minutes (before 5-minute expiry)
- Show a small "Refreshing..." indicator on refresh

**QR code sizing:** ~200x200px, high contrast (dark on light background regardless of theme) for reliable scanning.

## 2. PWA Install Prompt (Mobile)

### User Flow

1. Mobile user visits app in browser (not installed as PWA)
2. Top banner appears: "Install Relay Chat for the best experience" + [Install] button
3. User taps Install → native browser install dialog
4. User dismisses → banner hides, stored in localStorage, doesn't show again for 7 days
5. If already in standalone mode (PWA installed) → banner never shows

### Frontend

**New component:** `InstallBanner.svelte`
- Listens for `beforeinstallprompt` event, stores the deferred prompt
- Only renders on mobile viewports (check `window.matchMedia('(max-width: 768px)')`)
- Detects standalone mode via `window.matchMedia('(display-mode: standalone)')` — if true, never show
- On "Install" click: calls `deferredPrompt.prompt()`
- On dismiss: sets `localStorage.setItem('install-banner-dismissed', Date.now())`
- On mount: checks localStorage, skips if dismissed within last 7 days
- Renders as a fixed top banner with a close (X) button

**Placement:** Rendered in `(app)/+layout.svelte`, above the connection-lost banner.

**Styling:** Matches app aesthetic — dark background, monospace, subtle. Not a bright/flashy banner.

## 3. Invite Visibility

### 3a. Welcome Screen After Bootstrap

**User Flow:**
1. Admin completes bootstrap (creates first account)
2. Instead of redirecting directly to `/channels`, redirect to `/welcome`
3. Welcome page shows:
   - "Your chat is ready!"
   - Auto-generated invite link (server creates an invite during bootstrap)
   - Copy button for the invite URL
   - "Go to chat" button → navigates to `/channels`

**Backend change:**
- `POST /api/auth/bootstrap` response includes an auto-generated invite code (created as part of bootstrap, no expiry, no max uses)
- New field in response: `{ user, token, inviteCode }`

**Frontend:**
- New route: `/welcome` — simple page, only accessible right after bootstrap (check for a flag in auth store or query param)
- After copying or clicking "Go to chat", navigates to `/channels`

### 3b. Sidebar Invite Button (Admin Only)

**Frontend change in `Sidebar.svelte`:**
- Add an "Invite" link in the sidebar, visible only when `authStore.isAdmin`
- Position: near the bottom, above the settings/logout links
- On click: navigates to `/settings` and scrolls to / focuses the invites section
- Simple text link with a small icon (person+ or link icon), matching existing sidebar style

## Dependencies

**Go:**
- No new dependencies for QR or tokens (token generation uses `crypto/rand`)

**Frontend:**
- `qrcode` npm package (lightweight QR code generator) — or a zero-dependency inline solution

## Out of Scope

- QR code on login page (for unauthenticated users) — requires different flow
- Push notification onboarding wizard — already handled by `initPush()` permission prompt
- iOS-specific install instructions — iOS doesn't support `beforeinstallprompt`, users must use Safari "Add to Home Screen" manually. Could add a text hint later.
- Notification settings in the onboarding flow — handled separately
