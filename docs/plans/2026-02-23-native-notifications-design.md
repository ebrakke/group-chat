# Native Push Notifications Design

## Summary

Replace Pushover-based notifications with native push notifications for the Android mobile app (via ntfy.sh + FCM) and Browser Notification API for web users. Remove Pushover entirely.

## Architecture

```
Message arrives (Go backend)
       |
       v
notifications.Service.Send()
       |
       +---> NtfyProvider: HTTP POST to ntfy.sh/{user_topic}
       |         |
       |         +---> ntfy.sh -> FCM -> Android device (background)
       |         +---> ntfy.sh -> WebSocket -> Android app (foreground)
       |
       +---> Web users: existing WebSocket -> Browser Notification API (client-side)
```

**Two notification paths, one trigger point:**

- **Android mobile**: Server POSTs to ntfy.sh per-user topic. ntfy.sh delivers via FCM (background) or WebSocket (foreground). The Capacitor app receives native push notifications.
- **Web**: No server-side push needed. The frontend already has a WebSocket connection. When a message arrives via WebSocket, fire the Browser Notification API locally.

## Admin One-Time Setup

1. Self-host ntfy.sh server (Docker one-liner) or use ntfy.sh cloud
2. Create a Firebase project, add Android app (`cc.brakke.relaychat`), configure ntfy.sh with the Firebase service account key
3. Set ntfy.sh server URL in Relay Chat admin settings page

## Components

### 1. Backend: NtfyProvider (`internal/notifications/ntfy.go`)

New provider implementing the existing `Provider` interface:

- `Send()` = `POST https://ntfy.example.com/{user_topic}` with headers for title, message, click URL, priority
- Uses ntfy.sh HTTP publishing API (no Firebase SDK needed in Go)
- Each user gets a unique ntfy topic token stored in the database

Replace `ReloadPushoverProvider()` with `ReloadNtfyProvider()` that reads `ntfy_server_url` from `app_settings`.

### 2. Database Changes

**New table: `push_subscriptions`**

```sql
CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ntfy_topic TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

**Changes to `app_settings`:**

- Remove: `pushover_app_token` seed
- Add: `ntfy_server_url` (admin-configurable)

**Changes to `user_notification_settings`:**

- The `provider` and `provider_config` columns become unused for mobile users (push is automatic if they have a subscription)
- Keep: `notify_mentions`, `notify_thread_replies`, `notify_all_messages`

### 3. API Changes

**New endpoints:**

- `POST /api/push/subscribe` - Mobile app registers its ntfy topic after login. Body: `{ "ntfyTopic": "...", "platform": "android" }`
- `DELETE /api/push/subscribe` - Unsubscribe on logout. Body: `{ "ntfyTopic": "..." }`

**Removed/changed:**

- Remove Pushover-specific admin settings handling
- Simplify notification settings (drop provider/providerConfig from user-facing API)
- Add ntfy server URL to admin settings

### 4. Mobile App (Capacitor)

- Install `@capacitor/push-notifications` plugin
- On login: register for FCM push, get FCM token
- Subscribe to user's ntfy.sh topic (register FCM token with ntfy.sh server for background delivery)
- Handle push notification taps -> deep link to channel/thread
- On logout: unsubscribe from ntfy topic

### 5. Web Frontend

- On WebSocket `new_message` events: fire `new Notification(title, { body, icon, tag })` via Browser Notification API
- Request notification permission on first login or via settings
- Respect user's notification preferences (mentions, thread replies, all messages)
- No external service needed for web

### 6. Settings UI Changes

**Remove:**
- Pushover admin section (app token input)
- Pushover user key input in user notification settings

**Add:**
- ntfy.sh server URL in admin settings section

**Keep:**
- Notification preference checkboxes (mentions, thread replies, all messages)
- Thread muting functionality

## Notification Flow (Detailed)

1. User sends a message in a channel
2. `messages.Service` creates the message, `notifications.Service.Send()` is called
3. For each non-author user, check notification rules (mentions, thread replies, all messages, muted threads)
4. If user should be notified AND has a `push_subscriptions` entry:
   - POST to `ntfy.sh/{user_ntfy_topic}` with notification content
   - ntfy.sh delivers via FCM to the Android device
5. Web users receive the message via WebSocket; the frontend decides locally whether to show a Browser Notification based on the same rules

## What Gets Removed

- `internal/notifications/pushover.go` (entire file)
- `internal/notifications/pushover_test.go` (entire file)
- Pushover UI in settings page (admin token input, user key input)
- Pushover admin settings API handling
- `pushover_app_token` from app_settings seed data

## What Gets Kept

- `Provider` interface (NtfyProvider implements it)
- `WebhookProvider` (generic, still useful)
- Notification rules engine (mentions, thread replies, all messages)
- Thread muting
- Deep link URL building
