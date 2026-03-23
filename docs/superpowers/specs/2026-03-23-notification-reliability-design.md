# Notification Reliability & Embedded ntfy Integration

## Problem

PWA push notifications are unreliable across platforms. Notifications are delayed or missed entirely when the browser process isn't running — a fundamental limitation of Web Push. On Android, even on stock Pixel devices, swiping away the browser means push messages queue until the app is reopened. On iOS, a bug in the current service worker causes silent pushes that lead Safari to revoke the push subscription entirely. On desktop, notifications stop when the browser closes.

For a messaging app, this is unacceptable. Users need to know when someone messages them.

## Solution

Two complementary changes:

1. **Harden existing Web Push** — fix the iOS silent push bug, add subscription health checks, move notification dedup to the backend, add a test notification button.
2. **Embed ntfy as a relay** — compile ntfy's Go server into the Relay Chat binary. Admin enables it with one toggle. Users get a one-tap setup on Android (deep link) or a guided copy-paste flow on iOS. ntfy's native apps use proper FCM/APNs, delivering notifications even when the browser is fully closed.

## Architecture

### Notification Pipeline (Updated)

```
Message created → notifyFunc callback
  → Service.Send(msg, channelName)
    → For each user (except author, excluding bots):
      → shouldNotify() — channel level, mentions, threads, mutes
      → If yes:
        → Skip if user has active WebSocket in target channel (backend dedup)
        → Try Web Push (existing VAPID flow)
        → Try ntfy publish (if enabled + user has topic)
        → Try Webhook fallback (existing)
```

All three channels fire independently. The user receives whichever arrives first. Dedup across channels is handled by notification tags — both Web Push and ntfy use the same message ID as the tag, so the OS collapses duplicates.

### Backend WebSocket Dedup

Currently the service worker checks if the user has a focused window and skips `showNotification()` if so. This causes silent pushes that break iOS subscriptions.

New approach: move this logic to the backend. Before sending a push, check if the user has an active WebSocket connection. If they do, skip the push entirely — the message is already being delivered in real-time via WebSocket. The service worker becomes unconditional: every push it receives, it displays.

This requires the WebSocket manager to expose a method like `IsUserConnected(userID)` that the notification service can query.

### Subscription Health Checks

On every app open (in `initPush()`):
1. Call `pushManager.getSubscription()`
2. If subscription exists, POST it to `/api/push/subscribe` (upsert — handles endpoint changes)
3. If subscription is null (expired/revoked), re-subscribe with fresh VAPID key and POST
4. Listen for `pushsubscriptionchange` event in the service worker to handle mid-session revocations

### Test Notification Button

In user settings, a "Send test notification" button that:
1. POST to `/api/push/test`
2. Backend sends a push through all configured channels (Web Push + ntfy)
3. Frontend waits up to 10 seconds for the notification
4. If it doesn't arrive, show platform-specific troubleshooting guidance

## Embedded ntfy Server

### Integration Approach

ntfy's Go server (`heckel.io/ntfy/v2/server`) is imported as a library and embedded into the Relay Chat binary. No separate process or Docker container.

Configuration:
- Mounted at `/ntfy/` sub-path on the existing HTTP server
- Anonymous read access enabled (subscribe without auth)
- Topic enumeration disabled (can't list/discover topics)
- Publishing restricted to internal backend service account
- Separate SQLite DB: `{data-dir}/ntfy-cache.db`
- Lifecycle tied to main process — starts when Relay Chat starts, stops when it stops

### Security Model

Instead of ntfy user accounts and authentication, security is based on **unguessable topic names**. Each user gets a topic like `relay-{uuid-v4}`. Since:
- Topics cannot be enumerated (disabled in config)
- Topic names are 128-bit random UUIDs
- Only the backend can publish (anonymous users can only subscribe)
- The ntfy instance is not advertised or linked publicly

...the topic name itself acts as a capability token. This eliminates all auth friction for end users.

If a user believes their topic is compromised, they can regenerate it in settings (new UUID, old topic stops receiving).

### Admin Setup

1. Admin navigates to the new admin settings page (`/settings/admin`)
2. Toggles "Enable notification relay" → on
3. The embedded ntfy server starts
4. All existing users get ntfy topics auto-generated
5. New users get topics on signup

No other configuration required. The admin doesn't interact with ntfy directly.

### User Setup — Android (One Tap)

1. User opens notification settings
2. Sees "Reliable Notifications" section with explanation: "Get notifications even when the app is closed. Requires the free ntfy app."
3. Taps "Set up ntfy"
4. Bottom sheet appears with "Open in ntfy" button
5. Button navigates to `ntfy://chat.example.com/ntfy/relay-{uuid}`
6. ntfy app opens and auto-subscribes to the topic
7. Done — notifications now arrive via FCM regardless of browser state

If ntfy isn't installed, the deep link fails. We detect this (timeout-based or intent fallback) and show an "Install ntfy" link to the Play Store, followed by the deep link button again.

### User Setup — iOS (Guided, ~3 Steps)

1. Same settings section, same "Set up ntfy" button
2. Bottom sheet shows step-by-step instructions:
   - "Install ntfy from the App Store" (link to App Store)
   - "Open ntfy → tap + → enter this server:" with tap-to-copy server URL
   - "Enter this topic:" with tap-to-copy topic name
3. Optionally display a QR code encoding the server + topic for easier entry

No account creation, no passwords, no invite codes. Just a server URL and a topic string.

### User Setup — Desktop

Desktop users don't need ntfy (they can keep the browser open). Show a tip in settings: "On desktop, notifications work best when your browser stays running." with a link to enable Chrome's "Continue running background apps" setting.

### ntfy Notification Payload

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

Tapping the notification opens the Relay Chat PWA to the correct channel/thread.

## Admin Settings Page

New route: `/settings/admin` — visible only to admin users.

### Sections

1. **Branding** — moved from user settings (app name, icon upload are server-level config)
2. **Invite Codes** — moved from user settings (server-level management)
3. **Notification Relay** — enable/disable ntfy, status indicator, user count with topics
4. **Bots** — moved from user settings (server-level config)

The existing user settings page becomes purely personal: display name, theme, per-channel notification preferences, push subscription management, ntfy setup.

## Database Changes

### New Column: `users` table

```sql
ALTER TABLE users ADD COLUMN ntfy_topic TEXT;
```

Nullable. Contains the UUID portion of the ntfy topic (e.g., `relay-a8f3b2c1-...`). Null means ntfy not configured for this user.

### New Setting: `app_settings` table

```sql
INSERT INTO app_settings (key, value) VALUES ('ntfy_enabled', 'false');
```

Boolean flag toggled by admin.

### No ntfy Auth Database

Since we use anonymous subscribe with unguessable topics, we don't need ntfy's user/auth database. The only state is the topic UUID stored in the users table and ntfy's internal message cache DB.

## Service Worker Changes

The service worker becomes simpler:

```typescript
sw.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    sw.registration.showNotification(data.title, data.options)
  );
});
```

No more client focus check. The backend handles dedup. Every push received is displayed. This fixes the iOS silent push subscription revocation bug.

Add `pushsubscriptionchange` handler:

```typescript
sw.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    sw.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(sub => {
        // POST new subscription to server
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth'))))
          })
        });
      })
  );
});
```

## What's Out of Scope

- Per-channel ntfy topics (one topic per user handles all their notifications)
- Rich actions in ntfy notifications (just tap to open)
- Email/SMS fallback for missed notifications
- App badge counts (`navigator.setAppBadge`)
- Notification sound/vibration customization
- ntfy file attachments or images in notifications

## Testing Strategy

- **Unit tests**: ntfy provider (publish, topic generation), backend WebSocket dedup logic, subscription health check endpoint
- **E2E tests**: test notification button flow, subscription re-validation on app open
- **Manual testing**: ntfy deep link on Android device, manual setup on iOS device, notification payload appearance in ntfy app
- **Test notification button**: serves as ongoing user-facing verification tool
