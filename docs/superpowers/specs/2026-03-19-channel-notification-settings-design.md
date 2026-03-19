# Per-Channel Notification Settings

**Date:** 2026-03-19
**Status:** Draft

## Summary

Replace global notification settings with per-channel notification levels. A bell icon in the channel header lets users cycle through 4 levels: everything, mentions, threads, nothing. Default is mentions. Existing per-thread mute stays as-is.

## Notification Levels

| Level | Behavior |
|-------|----------|
| `everything` | All messages in the channel |
| `mentions` | Only when @mentioned (DEFAULT) |
| `threads` | Only replies in threads the user has participated in |
| `nothing` | Muted — no notifications from this channel |

Per-thread mute (`thread_mutes` table) is orthogonal — if a user is on the `threads` level but has muted a specific thread, they won't get notified for that thread.

## Backend

### New table (migration 021)

```sql
CREATE TABLE IF NOT EXISTS channel_notification_settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'mentions',
    PRIMARY KEY (user_id, channel_id)
);
```

No rows are pre-populated. Missing row = default level (`mentions`). Rows are created lazily when a user explicitly changes the level.

### Updated `shouldNotify()` logic

Replace the current logic that reads from `user_notification_settings` with per-channel lookup:

```
func shouldNotify(userID, msg, channelID):
    level = getChannelNotificationLevel(userID, channelID)  // returns "mentions" if no row

    switch level:
    case "everything":
        return true
    case "mentions":
        return isMentioned(username, msg.mentions)
    case "threads":
        if msg.parentID == nil:
            return false  // top-level messages don't notify in threads mode
        return userParticipatedInThread(userID, msg.parentID) && !isThreadMuted(userID, msg.parentID)
    case "nothing":
        return false
```

### Remove old global settings

- The `user_notification_settings` table becomes unused
- Remove `GetSettings()`, `UpdateSettings()` from the notification service
- Remove `GET/POST /api/notifications/settings` endpoints
- Remove the old `shouldNotify()` that reads from `user_notification_settings`
- Don't drop the table in this migration (can clean up later) — just stop reading from it

### API Endpoints

- `GET /api/channels/{id}/notifications` (authenticated) — returns `{ level: "mentions" }` (reads from table, defaults to "mentions" if no row)
- `PUT /api/channels/{id}/notifications` (authenticated) — accepts `{ level: "everything"|"mentions"|"threads"|"nothing" }`, upserts the row

### `sendToUser()` changes

The `sendToUser()` method currently gets the channel name but not the channel ID. The `msg` object has `msg.ChannelID`, so we can use that.

Update `sendToUser()` to call the new `shouldNotify()` with the channel ID from the message.

## Frontend

### Bell Icon in Channel Header

**Location:** Top bar of the channel view (where the channel name is displayed).

**Behavior:**
- Displays current notification level as an icon
- Click cycles: `mentions → everything → threads → nothing → mentions`
- Sends `PUT /api/channels/{id}/notifications` on each click
- Optimistic update — changes icon immediately, reverts on error

**Icons (using inline SVGs matching app aesthetic):**
- `everything` — bell with lines (ringing)
- `mentions` — bell (default, neutral)
- `threads` — chat bubble or bell with dot
- `nothing` — bell with slash (muted)

**Tooltip/label:** Shows on hover — "Notifying: all messages" / "Notifying: mentions" / "Notifying: threads" / "Muted"

**Component:** Add to the existing channel header area. Small, unobtrusive — matches the monospace, minimal style.

### Load notification level with channel

When a channel is selected, fetch its notification level. Can be done:
- As a separate `GET /api/channels/{id}/notifications` call when the channel loads
- Or bundled into the channel data response (add `notificationLevel` field to the channel list endpoint)

**Recommendation:** Separate call is simpler and avoids changing the channel list API. Cache it in the channel store.

## Migration Path

1. Add `channel_notification_settings` table (migration 021)
2. Update `shouldNotify()` to read per-channel settings
3. Add API endpoints for get/set channel notification level
4. Add bell icon to channel header
5. Stop reading from `user_notification_settings` (leave table, just don't use it)
6. Remove old notification settings endpoints and UI references

## Out of Scope

- Channel hiding/invisible mode — all channels always visible
- Global notification override — per-channel is the only control
- Notification sound/vibration settings — browser defaults
- Migrating existing `user_notification_settings` data into per-channel settings — fresh start, defaults apply
