# Onboarding UX — QR Login, PWA Install Prompt, Invite Visibility

**Date:** 2026-03-18
**Status:** Draft

## Summary

Unified onboarding experience with three features: QR code session transfer for mobile login, PWA install prompt on mobile browsers, and improved invite link visibility after bootstrap and in the sidebar.

## 1. QR Code Login (Settings Page)

### User Flow

1. Logged-in user opens Settings on desktop
2. New "Log in on another device" section shows a QR code
3. QR encodes `{origin}/auth/transfer/{token}`
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
- `POST /api/auth/transfer-token` (authenticated) — generates a random 32-byte hex token, stores with 5-minute expiry, returns `{ token }`. Cleans up any existing tokens for the user first (max 1 active per user). Also deletes any expired tokens for all users (lazy cleanup).
- `GET /auth/transfer/{token}` (unauthenticated, NOT under `/api/`) — validates token exists, is not expired, and the associated user still exists. Creates a new session for the user, sets the session cookie (with `Secure` flag in production — see Security section), deletes the token, redirects with `302` to `/channels`. Sets `Cache-Control: no-store` on the response. Returns 410 Gone for all failure cases (expired, used, invalid, user deleted) — same response regardless of reason to avoid information leakage.

**Token lifecycle:**
- Generated on demand when settings page loads the QR section
- Expires after 5 minutes
- Single use (deleted on consumption)
- Old tokens for the same user are cleaned up on new token generation
- Expired tokens for all users cleaned up lazily during token generation

**URL construction:** The frontend constructs the full QR URL using `window.location.origin + '/auth/transfer/' + token`. The API returns only the token — no need for the backend to know the base URL for this.

### Frontend

**Settings page** — new section after the account section (visible to all users):
- Heading: "Log in on another device"
- Subtext: "Scan this QR code with your phone to log in instantly"
- QR code rendered client-side using `qrcode` npm package
- Auto-refreshes token every 4 minutes (before 5-minute expiry)
- Uses `visibilitychange` event to pause refresh when tab is backgrounded, refresh immediately on focus
- Show a small "Refreshing..." indicator on refresh

**QR code sizing:** ~200x200px, high contrast (dark on light background regardless of theme) for reliable scanning.

### Security

- 32-byte random token (256 bits of entropy) — computationally infeasible to brute-force
- Single-use with 5-minute expiry limits attack window
- `GET /auth/transfer/{token}` returns the same 410 response for all failure modes (no timing/enumeration leakage)
- Session cookie: set `Secure: true` when not in dev mode (applies to both this endpoint and existing `setSessionCookie` — fix the existing function)
- `Cache-Control: no-store` on the transfer response to prevent caching
- `302` redirect (not 301) to prevent browser caching the redirect
- Rate limit: apply existing `authRL` (30/min) to the transfer endpoint
- If phone already has a session for a different user, the new cookie overwrites it (expected behavior)

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
- Only renders when the deferred prompt exists (this naturally limits to supported browsers — Chrome Android, Edge, Samsung Internet. Firefox and iOS Safari don't fire this event.)
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
- The `handleBootstrap` API handler creates an invite (via `authSvc.CreateInvite(user.ID, nil, nil)`) after successful bootstrap, and includes the code in the response.
- Updated response: `{ user, token, inviteCode }`

**Frontend:**
- New route: `/welcome` — outside the `(app)/` layout group (like `/login` and `/bootstrap`)
- `authStore.bootstrap()` stores the invite code in a local variable (`authStore.bootstrapInviteCode`)
- `/welcome` page reads this variable. If it's empty (e.g., direct navigation or refresh), redirects to `/channels`
- After copying or clicking "Go to chat", clears the variable and navigates to `/channels`
- Add `/welcome` to the public routes list in `+layout.svelte`

### 3b. Sidebar Invite Button (Admin Only)

**Frontend change in `Sidebar.svelte`:**
- Add an "Invite" link in the sidebar, visible only when `authStore.isAdmin`
- Position: near the bottom, above the settings/logout links
- On click: navigates to `/settings` (invites section is already there)
- Simple text link with a small icon, matching existing sidebar style

## Dependencies

**Go:**
- No new dependencies (token generation uses existing `crypto/rand` pattern)

**Frontend:**
- `qrcode` npm package (lightweight QR code generator)

## Out of Scope

- QR code on login page (for unauthenticated users) — requires different flow
- Push notification onboarding wizard — already handled by `initPush()` permission prompt
- iOS-specific install instructions — iOS doesn't support `beforeinstallprompt`, users must use Safari "Add to Home Screen" manually. Could add a text hint later.
- Notification settings in the onboarding flow — handled separately
