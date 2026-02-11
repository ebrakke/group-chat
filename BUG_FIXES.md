# Bug Fixes - Thread Replies & Message Edits

## Summary

Fixed two critical bugs in the Relay Chat frontend/API:
1. Thread replies not appearing in UI without page refresh
2. Message edits appending new messages instead of updating in-place

## BUG-1: Thread Replies Not Appearing

### Problem
- When posting a reply in the thread panel, it didn't show up until page refresh
- When "also send to channel" checkbox was checked, the message didn't appear in the main channel list
- The API requests were succeeding, but the WebSocket events weren't properly updating the UI

### Root Cause
- The API was broadcasting the thread reply immediately, but when "also send to channel" was checked, it relied on the Nostr subscription to broadcast the channel message
- This caused a delay or missing update in the UI
- The ThreadPanel's `addReply()` method needed duplicate detection

### Solution
**API Changes (api/src/routes/messages.ts):**
- Modified the thread reply endpoint to immediately broadcast both the thread reply AND the channel message (when `alsoSendToChannel` is true) via WebSocket
- Create a proper channel message object when `alsoSendToChannel` is checked
- Call `wsHandler.broadcastNewMessage()` immediately instead of waiting for Nostr subscription

**Frontend Changes (frontend/src/lib/components/ThreadPanel.svelte):**
- Added duplicate detection in `addReply()` to prevent the same reply from being added multiple times

**Frontend Changes (frontend/src/routes/+page.svelte):**
- Added error handling and type checking in `handleThreadReply()` when calling `threadPanelRef.addReply()`
- Added defensive programming to handle cases where the ref might not be set correctly

## BUG-2: Message Edits Appending Instead of Updating

### Problem
- When editing a message, a new message appeared at the bottom of the chat
- The original message remained unchanged
- This made editing unusable

### Root Cause
The issue was with ID matching:
1. When editing a message, Nostr creates a NEW event with a NEW ID
2. The new event references the original via an 'e' tag
3. The API was returning the NEW event ID, not the original message ID
4. The WebSocket handler was broadcasting the edit with the NEW event ID
5. The frontend's `handleUpdatedMessage()` tried to match by ID, but the original message had the ORIGINAL ID
6. No match was found, so the message appeared as a new message

### Solution
**WebSocket Handler Changes (api/src/websocket/handler.ts):**
- Modified `handleMessageEvent()` to detect edit events (those with an 'e' tag)
- When an edit is detected, extract the original message ID from the 'e' tag
- Query the original event to get its correct `createdAt` timestamp
- Use the original message ID in the broadcast message, not the new event ID
- This ensures the frontend can correctly match and update the original message

**API Changes (api/src/routes/messages.ts):**
- Modified the PATCH endpoint response to return the original message ID instead of the edit event ID
- This ensures consistency between the API response and WebSocket broadcasts

## Testing

Both bugs have been verified fixed:

### Thread Replies
✅ Thread replies now appear immediately in the thread panel
✅ When "also send to channel" is checked, the message appears immediately in the main channel
✅ No duplicate messages appear
✅ Thread count increments correctly

### Message Edits
✅ Edited messages update in-place
✅ The original message is replaced with the edited content
✅ No duplicate messages are created
✅ Edit timestamp is correctly displayed
✅ Original creation timestamp is preserved

## Technical Details

### WebSocket Event Flow (Thread Replies)
1. User posts reply in thread panel
2. API publishes thread event (kind 11 or 1111) to Nostr
3. If `alsoSendToChannel`, API publishes channel message (kind 9) to Nostr
4. API immediately broadcasts:
   - `thread.new` event with reply message
   - `message.new` event with channel message (if applicable)
5. Frontend receives both events and updates UI immediately

### WebSocket Event Flow (Message Edits)
1. User edits a message
2. API publishes edit event (kind 9 with 'e' tag) to Nostr
3. WebSocket handler receives the edit event
4. Handler detects 'e' tag and queries original event
5. Handler broadcasts `message.updated` with:
   - Original message ID (from 'e' tag)
   - Updated content
   - Original createdAt timestamp
   - Edit timestamp in editedAt field
6. Frontend's `handleUpdatedMessage()` matches by original ID and updates in-place

## Files Modified

- `api/src/routes/messages.ts` - Thread reply endpoint improvements
- `api/src/websocket/handler.ts` - Message edit ID handling
- `frontend/src/lib/components/ThreadPanel.svelte` - Duplicate detection
- `frontend/src/routes/+page.svelte` - Error handling for thread panel ref

## Commit

```
commit d90c102
Fix thread reply and message edit bugs
```
