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
- On server startup, check `app_settings` for `vapid_public_key`. If missing, generate a VAPID key pair and store both `vapid_public_key` and `vapid_private_key` in `app_settings`. Log when keys are generated.
- Expose public key via `GET /api/push/vapid-key`

**Push Subscription Storage:**
- New migration (019) replaces the ntfy-based `push_subscriptions` table:
  ```sql
  DROP TABLE IF EXISTS push_subscriptions;

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
  CREATE INDEX idx_web_push_subs_user ON web_push_subscriptions(user_id);
  ```
- Per-user subscription limit: max 10 subscriptions per user (reject with 409 if exceeded)

**API Endpoints (reuse existing route prefix):**
- `GET /api/push/vapid-key` — returns VAPID public key
- `POST /api/push/subscribe` — stores browser push subscription `{endpoint, p256dh, auth}` (replaces existing ntfy handler)
- `DELETE /api/push/subscribe` — removes subscription by endpoint (replaces existing ntfy handler)
- `GET /api/push/subscriptions` — lists user's subscriptions (for management UI)

**Web Push Provider — Integration with `Provider` interface:**

The web push provider does NOT use the existing `Provider` interface, because web push subscriptions require three values (endpoint, p256dh, auth) rather than a single `ProviderKey` string. Instead, `sendToUser()` is modified to call web push delivery directly:

```go
func (s *Service) sendToUser(userID int64, msg *messages.Message, channelName string) {
    settings, err := s.GetSettings(userID)
    // ... existing shouldNotify() check ...

    payload := s.buildPayload(msg, channelName)

    // Try web push subscriptions first
    subs, _ := s.GetWebPushSubscriptions(userID)
    if len(subs) > 0 {
        s.sendWebPush(subs, payload)
        return
    }

    // Fall back to configured provider (webhook)
    // ... existing webhook logic ...
}
```

The `sendWebPush()` method:
- Uses `github.com/SherClockHolmes/webpush-go`
- Transforms the internal `Payload` into browser notification format:
  ```json
  {
    "title": "New message in #general",
    "options": {
      "body": "Alice: Hello everyone",
      "icon": "/icon-192.png",
      "data": {
        "path": "/#/channel/5",
        "channelId": 5,
        "threadId": null
      }
    }
  }
  ```
- Sets urgency to "high" for reliable delivery
- On HTTP 410 (Gone) response, deletes the expired subscription from the database
- Sends to all of a user's subscriptions concurrently

**HTTPS Requirement:** Web Push requires a secure context. Localhost works in dev mode. Non-HTTPS deployments will fail silently for push subscriptions.

### Frontend (SvelteKit)

**Service Worker (`service-worker.ts`) — add push handlers:**
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
  const url = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const focused = clients.find(c => c.focused)
      if (focused) return focused.navigate(url)
      return self.clients.openWindow(url)
    })
  )
})
```

**Notification Deduplication:**
The service worker push handler checks if any client window is focused. If so, it skips `showNotification()` — the user is already looking at the app and will see messages via WebSocket. Remove `showBrowserNotification()` from `ws.svelte.ts` entirely to avoid duplicates.

```js
self.addEventListener('push', async (event) => {
  const data = event.data.json()
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const hasFocusedClient = clients.some(c => c.focused)
  if (hasFocusedClient) return // User is looking at the app
  event.waitUntil(
    self.registration.showNotification(data.title, data.options)
  )
})
```

**Push Subscription Flow:**
- New `$lib/push.svelte.ts` module:
  1. Fetch VAPID public key from `/api/push/vapid-key`
  2. Get existing service worker registration
  3. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  4. POST subscription to `/api/push/subscribe`
- Called from `(app)/+layout.svelte` on mount (after auth)
- If permission is "default", request it with a UI prompt (bell icon or banner)
- If permission is "denied", show help text (how to enable in browser settings)

**On logout:** Unsubscribe from push manager and DELETE the subscription from the server so the device stops receiving notifications for that user.

**Notification Settings Page:**
- Update existing notification settings to show web push status
- Show "Enable notifications" button if not subscribed
- Remove ntfy-specific configuration UI

### Removals

**Delete entirely:**
- `mobile/` directory (Capacitor config, Android project, package.json)
- `frontend/src/lib/utils/native.ts` (foreground service, local notifications, back button)
- All `isNative()` conditional branches in the frontend
- Makefile targets: `mobile-sync`, `mobile-build`, `mobile-open`
- ntfy provider (`ntfy.go`, `ntfy_test.go`) and related app settings
- `push_subscriptions` table (replaced by `web_push_subscriptions` in migration 019)
- `ReloadNtfyProvider()` method and ntfy registration in `cmd/app/main.go`
- `ntfy_server_url` app setting
- `showBrowserNotification()` in `ws.svelte.ts` and `showNativeNotification()` calls

**Frontend packages to uninstall:**
- `@capacitor/app`
- `@capacitor/core`
- `@capacitor/local-notifications`
- `@capawesome-team/capacitor-android-foreground-service`

**Simplify:**
- `platform.ts` — remove `isNative()` and `getApiBase()`. Keep `isMobile()` (responsive layout) and simplify `getWsUrl()` (remove native branch).
- `api.ts` — remove `isNative()` branch for Bearer token auth, always use cookies
- `+layout.svelte` — remove native-specific service worker skip and server URL config
- `(app)/+layout.svelte` — remove `initNativeNotifications()`, `setupBackButton()`, `stopNativeNotifications()`
- `ws.svelte.ts` — remove all `showBrowserNotification()` and `showNativeNotification()` calls (push handles it now)

## Migration Path

1. Add `web_push_subscriptions` table + drop old `push_subscriptions` (migration 019)
2. Add VAPID key generation on startup
3. Add web push delivery in `sendToUser()` + new API endpoints
4. Wire up frontend subscription flow + service worker push handlers
5. Remove Capacitor code, ntfy provider, native.ts, and all isNative() branches
6. Uninstall Capacitor frontend packages

## Dependencies

**Go:**
- `github.com/SherClockHolmes/webpush-go` — VAPID signing + Web Push protocol

**Frontend:**
- No new dependencies — uses standard Push API and Service Worker API

## Testing

- E2E: Playwright can test subscription API flow (subscribe, list, unsubscribe)
- Unit: Go tests for web push provider (mock HTTP), subscription CRUD, VAPID key generation
- Manual: Test on Chrome (desktop + Android), Safari (desktop + iOS), Firefox

## Notes

- Existing PWA installations will get the new service worker on next visit. Users must open the app at least once after deployment to start receiving push notifications.
- The existing `shouldNotify()` logic (mentions, thread replies, all messages) is preserved unchanged.
- Webhook provider is kept as an alternative for users who prefer it.

## Out of Scope

- Badge count (`navigator.setAppBadge`) — nice-to-have, add later
- PWA install prompt UI — browser handles this natively, no custom UX needed for now
- Offline support — existing service worker cache strategy is sufficient
- Per-channel notification settings — existing mention/thread/all toggle is enough
- Skip push for users with active WebSocket in target channel — add later if needed
