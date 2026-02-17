# Webhook Notifications Design

**Date:** 2026-02-17
**Status:** Approved

## Overview

Add mobile notifications to Relay Chat via user-configured webhooks. Users provide their own webhook URL (Pushover, ntfy.sh, or any service), and the Go backend sends notifications when relevant messages arrive. Notifications include deep links to open the PWA directly to the specific channel/thread.

## Goals

- Enable mobile notifications without running a centralized notification server
- Support popular webhook services (Pushover, ntfy.sh, custom endpoints)
- Smart defaults: notify on @mentions and thread replies, with per-thread muting
- Deep links that open PWA to the exact message/thread

## Architecture

### System Flow

1. User sends message via API (`POST /api/channels/{id}/messages` or `POST /api/messages/{id}/reply`)
2. API handler calls `messages.Create()` or `messages.CreateReply()`
3. Message saved to database, Nostr event created
4. **Notification hook triggered** after successful message creation
5. Backend queries notification rules for affected users
6. For each matching user, sends HTTP POST to their configured webhook URL (async, non-blocking)
7. Webhook service delivers mobile notification
8. User taps notification → deep link opens PWA to exact channel/thread

### Data Flow

```
API Request → messages.Create()/CreateReply() → Save to DB → notifications.Send() → HTTP POST → Webhook
                                                      ↓
                                              Query: settings, mutes, membership, mentions
```

## Database Schema

### `user_notification_settings`

```sql
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    base_url TEXT NOT NULL,  -- e.g., "https://chat.example.com" for deep links
    notify_mentions BOOLEAN DEFAULT 1,
    notify_thread_replies BOOLEAN DEFAULT 1,
    notify_all_messages BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### `thread_mutes`

```sql
CREATE TABLE thread_mutes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, message_id)
);
```

**Indexes:**
- `thread_mutes(user_id)` - for quick lookups when checking if a user muted a thread
- `thread_mutes(message_id)` - for cleanup if a thread is deleted

**Notes:**
- `base_url` is needed to construct deep links (e.g., `https://chat.example.com/#/channel/123/thread/456`)
- Default is mentions + thread replies enabled, all messages disabled
- Thread mutes are stored by parent message ID (the thread root)

## Notification Rules Logic

For each new message, check all users in the channel and send a notification if:

1. **User has notification settings configured** (webhook_url exists)
2. **User is not the message author** (don't notify yourself)
3. **At least one condition matches:**
   - **Mention:** Message contains `@username` AND `notify_mentions = true`
   - **Thread reply:** Message is a reply to a thread the user participated in AND `notify_thread_replies = true` AND thread is not muted
   - **All messages:** `notify_all_messages = true` (rare, but supported)
4. **Thread not muted:** User hasn't muted this specific thread (check `thread_mutes` table)

### Determining Thread Participation

User is considered a thread participant if:
- User is the thread author (parent message creator), OR
- User has replied to this thread (exists in `messages` where `parent_id = X` and `user_id = Y`)

### Mention Detection

- Use existing `extractMentions()` function from `messages.go`
- Match against actual usernames in the database (case-insensitive)

## Webhook Payload Format

Standard JSON payload sent to webhook URL via HTTP POST:

```json
{
  "title": "New message in #general",
  "message": "@alice check out this link: https://example.com",
  "sender": "Bob Smith",
  "channel": "general",
  "channelId": 123,
  "threadContext": "Re: Project kickoff discussion",
  "url": "https://chat.example.com/#/channel/123/thread/456",
  "timestamp": "2026-02-17T10:30:00Z",
  "notificationType": "mention"
}
```

### Fields

- `title`: Human-readable notification title (varies by type)
- `message`: Full message content (truncated to 500 chars if needed)
- `sender`: Display name of the sender
- `channel`: Channel name (human-readable)
- `channelId`: Channel ID (for programmatic use)
- `threadContext`: If a reply, shows parent message preview (120 chars), otherwise null
- `url`: Deep link to the specific message/thread
- `timestamp`: ISO 8601 timestamp
- `notificationType`: One of: `"mention"`, `"thread_reply"`, `"all_messages"`

### Title Variations

- Mention: `"@you mentioned in #channel"`
- Thread reply: `"New reply in #channel"`
- All messages: `"New message in #channel"`

### Service Compatibility

Services like Pushover and ntfy.sh can use:
- `title` for notification title
- `message` for notification body
- `url` for clickable link

## Backend Implementation

### Package: `internal/notifications/`

**Core Service:**

```go
type Service struct {
    db *db.DB
}

// Send checks notification rules and sends webhooks for a new message
func (s *Service) Send(msg *messages.Message, channelName string) error

// GetSettings retrieves user notification settings
func (s *Service) GetSettings(userID int64) (*Settings, error)

// UpdateSettings updates user notification settings
func (s *Service) UpdateSettings(userID int64, settings *Settings) error

// MuteThread mutes a thread for a user
func (s *Service) MuteThread(userID, messageID int64) error

// UnmuteThread unmutes a thread for a user
func (s *Service) UnmuteThread(userID, messageID int64) error

// IsThreadMuted checks if a user has muted a thread
func (s *Service) IsThreadMuted(userID, messageID int64) (bool, error)
```

### Integration Points

1. `messages.Create()` - after saving message, call `notifications.Send(msg, channelName)`
2. `messages.CreateReply()` - after saving reply, call `notifications.Send(msg, channelName)`
3. Wire up notification service in `cmd/app/main.go`

### Error Handling

- Log webhook failures but don't block message creation
- Use a short timeout (5 seconds) for webhook HTTP requests
- Fire-and-forget approach (no retries in v1)

### Concurrency

- Send webhooks in goroutines so message API returns quickly
- Use `http.Client` with timeout configured

## Frontend Implementation

### Settings UI

Add "Notifications" section to user settings panel with:

- **Webhook URL** (text input, required to enable notifications)
- **Base URL** (text input, e.g., `https://chat.example.com`, for deep links)
- **Notify on @mentions** (checkbox, default: on)
- **Notify on thread replies** (checkbox, default: on)
- **Notify on all messages** (checkbox, default: off)
- Help text with examples for Pushover, ntfy.sh webhook URLs
- Save button calls `POST /api/notifications/settings`

### Thread Mute/Unmute

- Add mute/unmute button in thread header (next to thread title)
- Icon: bell-slash when unmuted, bell when muted
- Calls `POST /api/threads/{id}/mute` or `DELETE /api/threads/{id}/mute`
- Visual indicator when viewing a muted thread

### Deep Link Routing

- Update frontend router to handle `/#/channel/{channelId}/thread/{threadId}`
- When opened, navigate to that channel and open the thread sidebar
- Scroll to the specific message if possible

### New API Endpoints

```
POST /api/notifications/settings    # Update notification settings
GET /api/notifications/settings     # Get current settings
POST /api/threads/{id}/mute         # Mute a thread
DELETE /api/threads/{id}/mute       # Unmute a thread
GET /api/threads/{id}/mute          # Check if muted
```

## Testing Strategy

### Unit Tests

- `notifications.Send()` - test rule matching logic (mentions, thread participation, mutes)
- `notifications.buildPayload()` - verify JSON structure
- Webhook URL validation (reject invalid URLs)
- Thread mute/unmute operations

### Integration Tests

- Create message → verify webhook called with correct payload
- Create reply → verify thread participants get notified
- Mute thread → verify no notifications sent
- Test @mention detection and notification

### Manual Testing

- Set up Pushover account and test end-to-end
- Set up ntfy.sh and test end-to-end
- Verify deep links open correct channel/thread in PWA
- Test on mobile (iOS/Android)

## Edge Cases

1. **Invalid webhook URL** - validate URL format before saving, show error to user
2. **Webhook endpoint down** - log error, don't crash, timeout after 5 seconds
3. **User deletes their account** - cascade delete notification settings and thread mutes
4. **Thread deleted** - cascade delete thread mutes
5. **Multiple mentions in one message** - only send one notification per user
6. **Self-mentions** (`@myself`) - don't notify (already filtered by "not author" rule)
7. **Bot messages** - bots can trigger notifications normally
8. **Empty webhook URL** - treat as notifications disabled
9. **Very long messages** - truncate to 500 chars in webhook payload
10. **Special characters in URLs** - URL-encode channel/thread IDs in deep links

## Migration Path

### Database Migration

Add migration to create both new tables with indexes.

### Backward Compatibility

- Existing users have no notification settings (webhook_url is null) → no notifications sent
- Users opt-in by configuring webhook URL in settings

## Future Enhancements (Out of Scope)

- Retry queue for failed webhook deliveries
- Per-channel notification preferences
- Notification batching (e.g., "3 new messages in #general")
- Rich notification content (images, reactions)
- Service-specific adapters (Pushover, ntfy.sh) for easier setup
- Notification history/logs in UI

## Service Examples

### Pushover

Webhook URL format:
```
https://api.pushover.net/1/messages.json?token=YOUR_APP_TOKEN&user=YOUR_USER_KEY
```

Pushover will extract `title`, `message`, and `url` from the JSON payload.

### ntfy.sh

Webhook URL format:
```
https://ntfy.sh/YOUR_TOPIC
```

ntfy.sh accepts JSON with `title`, `message`, and `click` (for URL).

### Custom Endpoint

Any HTTP endpoint that accepts JSON POST will work. Users can write their own webhook handlers.

## Summary

This design provides flexible, self-hosted mobile notifications via webhooks. Users bring their own notification service (Pushover, ntfy.sh, etc.), configure it once, and get smart notifications with deep links. The implementation is simple, maintainable, and can be extended later with retry logic or service-specific adapters if needed.
