# Notification Reliability & ntfy Integration

## Problem

PWA push notifications are unreliable across platforms. Notifications are delayed or missed entirely when the browser process isn't running — a fundamental limitation of Web Push. On Android, even on stock Pixel devices, swiping away the browser means push messages queue until the app is reopened. On iOS, a bug in the current service worker causes silent pushes that lead Safari to revoke the push subscription entirely. On desktop, notifications stop when the browser closes.

For a messaging app, this is unacceptable. Users need to know when someone messages them.

## Solution

Two complementary changes:

1. **Harden existing Web Push** — fix the iOS silent push bug, add subscription health checks, use notification tags for cross-channel dedup, add a test notification button.
2. **Add ntfy as a notification relay** — admin configures an ntfy server URL (self-hosted or ntfy.sh). Relay Chat publishes to per-user ntfy topics via HTTP API. Users get a one-tap setup on Android (deep link) or a guided copy-paste flow on iOS. ntfy's native apps use proper FCM/APNs, delivering notifications even when the browser is fully closed.

## Architecture

### Notification Pipeline (Updated)

```
Message created → notifyFunc callback
  → Service.Send(msg, channelName)
    → For each user (except author, excluding bots):
      → shouldNotify() — channel level, mentions, threads, mutes
      → If yes:
        → Send Web Push with tag=msg-{id} (existing VAPID flow)
        → Send ntfy publish with tag=msg-{id} (if enabled + user has topic)
        → Send Webhook (existing fallback, if configured)
```

All three channels fire independently and in parallel. This is a change from the current `sendToUser()` implementation, which uses a fallback chain (Web Push first, webhook only if no subscriptions). The function must be restructured to remove the early return after Web Push and fire all configured providers.

Web Push notifications use `msg-{id}` as the notification tag for OS-level dedup within the Web Push channel.

**Important: cross-channel dedup (Web Push + ntfy) does not work at the OS level.** Web Push and ntfy use different Android/iOS notification channels, so the OS cannot collapse them by tag. The intended usage model is that ntfy **replaces** Web Push on mobile — users who enable ntfy for reliable delivery should disable browser notifications. The setup UI should guide this: when a user enables ntfy, suggest disabling browser push ("You're all set! ntfy will handle your notifications now. You can disable browser notifications to avoid duplicates.").

This replaces the current approach of suppressing notifications in the service worker when the user is focused. That approach caused silent pushes that break iOS subscriptions (see below).

### Dedup Strategy: Tags, Not Suppression

**Current (broken):** The service worker checks `clients.some(c => c.focused)` and skips `showNotification()` if the user is focused. Safari counts skipped pushes as "silent pushes" and revokes the subscription after ~3 occurrences.

**New approach:** The service worker always shows every notification it receives — no conditional logic. Web Push notifications carry a `tag` field set to `msg-{id}` for within-channel dedup (e.g., if a push is retried). When the user is actively using the app, they'll see the message via WebSocket in real-time and may also see a brief push notification. This is a better tradeoff than missing notifications entirely.

The `Payload` struct in `provider.go` needs a new `MessageID int64` field, populated from `msg.ID` in `buildPayload()`. This is used to generate the tag string for Web Push.

The Web Push payload gains a `tag` field:

```json
{
  "title": "New message in #general",
  "options": {
    "body": "Alice: Hello everyone",
    "tag": "msg-42",
    "icon": "/icon-192.png",
    "data": {
      "path": "/#/channel/5",
      "channelId": 5
    }
  }
}
```

The existing `webPushPayloadOpts` struct in `notifications.go` needs a `Tag` field added.

### Subscription Health Checks

On every app open (in `initPush()`):
1. Call `pushManager.getSubscription()`
2. If subscription exists, POST it to `/api/push/subscribe` (upsert — handles endpoint changes transparently)
3. If subscription is null (expired/revoked), re-subscribe with fresh VAPID key and POST

Note: The `pushsubscriptionchange` service worker event is intentionally **not** implemented. It requires authentication from the service worker context (which doesn't have access to the session cookie reliably across browsers), and the on-app-open health check already covers this case. Simpler is better here.

### Test Notification Button

In user settings, a "Send test notification" button that:
1. POST to `/api/push/test`
2. Backend sends a test push through all configured channels (Web Push + ntfy) with a `test: true` flag and a unique tag `test-{timestamp}` in the payload (distinct from message tags to avoid collapsing with real notifications)
3. The service worker detects the test flag and uses `BroadcastChannel` to notify the open page that the push arrived
4. Frontend listens on the `BroadcastChannel` and shows a success indicator
5. If nothing arrives within 10 seconds, show platform-specific troubleshooting guidance:
   - **Android**: "Check that Chrome is not battery-optimized in your device settings"
   - **iOS**: "Make sure this app is added to your home screen"
   - **Desktop**: "Notifications require your browser to be running"

## ntfy Integration

### Why Not Embed ntfy

The original design considered embedding ntfy's Go server directly into the Relay Chat binary. However, ntfy depends on `mattn/go-sqlite3` (cgo-based SQLite), while Relay Chat uses `modernc.org/sqlite` (pure Go, no cgo). This is a fundamental incompatibility — embedding ntfy would break the "single binary, no cgo" constraint that makes Relay Chat easy to deploy.

Additionally, ntfy's server package is not designed as an embeddable library. It manages its own HTTP mux, configuration, logging, and lifecycle.

### Integration Approach: HTTP API Client

Instead, Relay Chat publishes to an external ntfy instance via its simple HTTP API. The admin configures the ntfy server URL in admin settings. This is dramatically simpler and still meets the reliability goal.

The server URL defaults to `https://ntfy.sh` (free hosted instance, no setup required). This works out of the box for small groups (~250 messages/day rate limit). Admins can override the URL to point at a self-hosted ntfy instance if they outgrow the free tier or want more control.

### Admin Setup

1. Admin navigates to the new admin settings page (`/settings/admin`)
2. In the "Notification Relay" section, toggles "Enable ntfy relay" → on
3. The server URL defaults to `https://ntfy.sh` — no further config needed for most deployments
4. All existing users get ntfy topics auto-generated (UUID)
5. New users get topics on signup

**Optional overrides** (collapsed "Advanced" section):
- **Server URL**: Change from `https://ntfy.sh` to a self-hosted instance (e.g., `https://ntfy.myserver.com`)
- **Publish token**: Bearer token for authenticated ntfy instances. Not needed for ntfy.sh or open instances.

### Security Model

Security is based on **unguessable topic names**. Each user gets a topic like `relay-{uuid-v4}`. Since:
- Topic names are 128-bit random UUIDs (not guessable, not enumerable on ntfy.sh)
- Only the backend publishes (via its own auth token if the instance requires one)
- Users only subscribe (read-only access to their own topic)

...the topic name itself acts as a capability token. This eliminates all auth friction for end users.

**Acknowledged security trade-offs** (acceptable for a self-hosted chat app):
- The topic UUID is visible in the ntfy app UI and in the deep link URL. Anyone with physical access to the device can see it.
- The topic acts as a bearer token with no expiration. There's no way to detect misuse — only reactive regeneration.
- On ntfy.sh (public instance), topic names are the only security boundary. For higher-security deployments, self-hosted ntfy with a locked-down config is recommended.

Users can **regenerate their topic** in settings at any time, which creates a new UUID and the old topic stops receiving messages immediately.

### User Setup — Android (One Tap)

1. User opens notification settings
2. Sees "Reliable Notifications" section with explanation: "Get notifications even when the app is closed. Requires the free ntfy app."
3. Taps "Set up ntfy"
4. Bottom sheet appears with two options always visible:
   - **"Install ntfy"** — link to Play Store (for users who don't have it yet)
   - **"Open in ntfy"** — deep link: `ntfy://ntfy.myserver.com/relay-{uuid}`
5. User installs ntfy (if needed), taps "Open in ntfy", ntfy app auto-subscribes
6. Bottom sheet shows success message: "You're all set! ntfy will handle your notifications now." with a toggle to disable browser push notifications (to avoid duplicates)
7. Done — notifications now arrive via FCM regardless of browser state

Both buttons are always shown (no unreliable deep link failure detection). The user knows whether they have ntfy installed.

### User Setup — iOS (Guided, ~3 Steps)

1. Same settings section, same "Set up ntfy" button
2. Bottom sheet shows step-by-step instructions:
   - "Install ntfy from the App Store" (link to App Store)
   - "Open ntfy → tap + → enter this server:" with **tap-to-copy** server URL
   - "Enter this topic:" with **tap-to-copy** topic name
3. Optionally display a QR code encoding the server + topic for easier entry

No account creation, no passwords, no invite codes. Just a server URL and a topic string.

### User Setup — Desktop

Desktop users don't need ntfy (they can keep the browser open). Show a tip in settings: "On desktop, notifications work best when your browser stays running." with a link to enable Chrome's "Continue running background apps" setting.

### ntfy Notification Payload

Published via HTTP POST to `{ntfy-server-url}/{topic}`:

```json
{
  "topic": "relay-{uuid}",
  "title": "New message in #general",
  "message": "Alice: Hey, are you free for lunch?",
  "click": "https://chat.example.com/#/channel/5",
  "icon": "https://chat.example.com/icon-192.png",
  "tags": ["speech_balloon"]
}
```

Tapping the notification opens the Relay Chat PWA to the correct channel/thread via the `click` URL.

### Stale Subscription Cleanup

- Web Push: the existing 410 (Gone) handling in `webpush.go` removes dead subscriptions. Additionally, add an in-memory counter for consecutive send failures per subscription (resets on server restart, which is acceptable — restarts are infrequent and a few extra retries to a dead endpoint are harmless). After 5 consecutive non-410 failures, remove the subscription.
- ntfy: topics don't expire or go stale (the backend publishes, ntfy delivers). When a user is deleted, their `ntfy_topic` is cleared and the backend stops publishing to it.

## Admin Settings Page

New route: `/settings/admin` — visible only to admin users. Non-admin users navigating here get redirected to `/settings`.

### Sections

1. **Branding** — moved from user settings (app name, icon upload are server-level config)
2. **Invite Codes** — moved from user settings (server-level management)
3. **Notification Relay** — ntfy server URL, optional publish token, enable/disable toggle, status indicator, count of users with ntfy topics configured
4. **Bots** — moved from user settings (server-level config)

The existing user settings page becomes purely personal: display name, theme, per-channel notification preferences, push subscription management, ntfy setup.

Existing deep links or bookmarks to settings items that moved will not break — the user settings page simply won't show those sections anymore. The admin settings page is a new route, not a replacement.

## Database Changes

### New Column: `users` table

```sql
ALTER TABLE users ADD COLUMN ntfy_topic TEXT;
```

Nullable. Contains the full topic name (e.g., `relay-a8f3b2c1-...`). Null means ntfy not configured for this user. Uses the existing migration numbering scheme (next sequential number).

### New Settings: `app_settings` table

```sql
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_server_url', 'https://ntfy.sh');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_publish_token', '');
```

- `ntfy_enabled`: boolean flag toggled by admin
- `ntfy_server_url`: the ntfy instance URL (e.g., `https://ntfy.sh`)
- `ntfy_publish_token`: optional Bearer token for authenticated ntfy instances (stored as plaintext in `app_settings`, same pattern as VAPID private keys — security boundary is the SQLite file itself; not displayed in UI after save)

## Service Worker Changes

The service worker becomes simpler:

```typescript
sw.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    (async () => {
      await sw.registration.showNotification(data.title, data.options);

      // If this is a test notification, tell the page it arrived
      if (data.test) {
        const bc = new BroadcastChannel('push-test');
        bc.postMessage({ received: true });
        bc.close();
      }
    })()
  );
});
```

No more client focus check. Every push received is displayed unconditionally. The `tag` field in `data.options` handles OS-level dedup. This fixes the iOS silent push subscription revocation bug.

## What's Out of Scope

- Embedding ntfy into the Relay Chat binary (incompatible SQLite dependency)
- Per-channel ntfy topics (one topic per user handles all their notifications)
- Rich actions in ntfy notifications (just tap to open)
- Email/SMS fallback for missed notifications
- App badge counts (`navigator.setAppBadge`)
- Notification sound/vibration customization
- ntfy file attachments or images in notifications
- `pushsubscriptionchange` event handling (covered by on-open health check)
- Backend WebSocket-based dedup (too risky — stale connections would swallow notifications)

## Testing Strategy

- **Unit tests**: ntfy HTTP client (publish, topic generation, error handling), notification tag generation, subscription health check endpoint, test notification endpoint
- **E2E tests**: test notification button flow (BroadcastChannel round-trip), subscription re-validation on app open
- **Manual testing**: ntfy deep link on Android device, manual setup on iOS device, notification payload appearance in ntfy app, verify tag-based dedup between Web Push and ntfy
- **Test notification button**: serves as ongoing user-facing verification tool

## Implementation Priority

1. Fix the service worker (remove focus check, add tag support) — immediate, low risk, high value
2. Add subscription health checks on app open — low risk, incremental improvement
3. Add test notification button with BroadcastChannel verification — good for debugging
4. Add notification tag to Web Push payload — enables cross-channel dedup
5. Admin settings page restructuring — can be done independently
6. ntfy HTTP client integration — new provider alongside Web Push and Webhook
7. User-facing ntfy setup UI (Android deep link, iOS guided flow) — depends on #6
