# Web Push PWA Notifications — Replace Capacitor

**Date:** 2026-03-18
**Status:** Draft

## Summary

Replace the Capacitor Android app and its local notification system with server-side Web Push (VAPID) notifications delivered through a PWA. This eliminates the native build pipeline, improves notification reliability, and adds iOS support for free.

## Motivation

The current Capacitor approach has fundamental limitations:
- **Fragile**: Relies on a foreground service keeping a WebSocket alive — OS can kill it
- **Android-only**: No iOS support
- **Build overhead**: Requires Gradle, Android SDK, APK signing, Capacitor sync
- **Local-only notifications**: If the app is killed, no notifications arrive

Web Push solves all of these — the server pushes directly to the browser/OS push service, which delivers even when the app is closed.

## Architecture

### Server Side (Go)

**VAPID Key Management:**
- Generate VAPID key pair on first boot, store in `app_settings` table (`vapid_public_key`, `vapid_private_key`)
- Expose public key via `GET /api/notifications/vapid-key`

**Push Subscription Storage:**
- New migration replaces `push_subscriptions` table:
  ```sql
  CREATE TABLE web_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh_key TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(endpoint, p256dh_key, auth_key)
  );
  ```

**API Endpoints:**
- `GET /api/notifications/vapid-key` — returns VAPID public key
- `POST /api/notifications/push-subscribe` — stores browser push subscription `{endpoint, p256dh, auth}`
- `DELETE /api/notifications/push-subscribe` — removes subscription by endpoint
- `GET /api/notifications/push-subscriptions` — lists user's subscriptions (for management UI)

**Web Push Provider:**
- New `webpush.go` provider implementing the existing `Provider` interface
- Uses a Go Web Push library (e.g., `github.com/SherClockHolmes/webpush-go`)
- Sends JSON payload: `{ title, options: { body, icon, data: { path, channelId, threadId } } }`
- Handles expired subscriptions (HTTP 410) by deleting them automatically
- Urgency: "high" for reliable delivery

**Delivery Flow:**
- `notifySvc.Send()` already iterates users and checks `shouldNotify()` — this stays
- Replace ntfy-specific push logic in `sendToUser()` with web push delivery
- For each user, fetch their `web_push_subscriptions` and send to all endpoints
- Keep webhook provider as fallback (some users may prefer it)

**Smart Targeting (future nice-to-have):**
- Skip users with active WebSocket connections in the target channel
- For now, the existing `shouldNotify()` rules + client-side dedup are sufficient

### Frontend (SvelteKit)

**Service Worker (`service-worker.ts`):**
- Add push event handler (alongside existing cache logic):
  ```js
  self.addEventListener('push', (event) => {
    const data = event.data.json()
    event.waitUntil(
      self.registration.showNotification(data.title, data.options)
    )
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const { path } = event.notification.data
    event.waitUntil(/* navigate or open window */)
  })
  ```

**Push Subscription Flow:**
- New `$lib/push.svelte.ts` module:
  1. Fetch VAPID public key from `/api/notifications/vapid-key`
  2. Register service worker
  3. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  4. POST subscription to `/api/notifications/push-subscribe`
- Called from `(app)/+layout.svelte` on mount (after auth)
- If permission is "default", request it with a UI prompt (bell icon or banner)
- If permission is "denied", show help text (how to enable in browser settings)

**Notification Settings Page:**
- Update existing notification settings to show web push status
- Show "Enable notifications" button if not subscribed
- Show list of active push subscriptions (with user-agent for device identification)
- Remove ntfy-specific configuration UI

**PWA Enhancements to `manifest.json`:**
- Already has `display: standalone`, icons, theme — good as-is
- Consider adding `shortcuts` for quick navigation (like Campfire does)

### Removals

**Delete entirely:**
- `mobile/` directory (Capacitor config, Android project, package.json)
- `frontend/src/lib/utils/native.ts` (foreground service, local notifications, back button)
- All `isNative()` conditional branches in the frontend
- Makefile targets: `mobile-sync`, `mobile-build`, `mobile-open`
- ntfy provider (`ntfy.go`, `ntfy_test.go`) and related app settings
- `push_subscriptions` table (replaced by `web_push_subscriptions`)

**Simplify:**
- `platform.ts` — remove `isNative()`, `getApiBase()` can be simplified (no more localStorage server URL)
- `+layout.svelte` — remove native-specific service worker skip and server URL config
- `(app)/+layout.svelte` — remove `initNativeNotifications()`, `setupBackButton()`
- `ws.svelte.ts` — remove `showNativeNotification()` calls, keep `showBrowserNotification()` as in-app indicator

## Migration Path

Since the existing ntfy push_subscriptions table is separate from web push, this is additive:

1. Add `web_push_subscriptions` table (new migration 019)
2. Add web push provider + API endpoints
3. Wire up frontend subscription flow
4. Remove Capacitor code and ntfy provider
5. Drop old `push_subscriptions` table in a later migration

## Dependencies

**Go:**
- `github.com/SherClockHolmes/webpush-go` — VAPID signing + Web Push protocol

**Frontend:**
- No new dependencies — uses standard Push API and Service Worker API

## Testing

- E2E: Playwright can't easily test real push, but can test subscription API flow
- Unit: Go tests for web push provider (mock HTTP), subscription CRUD
- Manual: Test on Chrome (desktop + Android), Safari (desktop + iOS), Firefox

## Out of Scope

- Badge count (`navigator.setAppBadge`) — nice-to-have, add later
- PWA install prompt UI — browser handles this natively, no custom UX needed for now
- Offline support — existing service worker cache strategy is sufficient
- Per-channel notification settings — existing mention/thread/all toggle is enough
