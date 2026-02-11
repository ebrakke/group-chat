# Thread Reply Latency Fix

## Problem
When posting a reply to a thread, users experienced significant latency before seeing the reply in the thread panel. They had to manually refresh the page to see their replies.

## Root Cause
The system was relying solely on the Nostr relay to echo thread reply events back via WebSocket subscriptions. This caused a delay between:
1. Publishing the thread reply (kind 11 or 1111) to Nostr
2. The Nostr relay processing the event
3. The WebSocket subscription receiving the event
4. The frontend updating the thread panel

## Solution
Implemented immediate WebSocket broadcasting for thread replies, similar to how regular messages are handled.

### Changes Made

#### 1. API WebSocket Handler (`api/src/websocket/handler.ts`)
Added a new method to broadcast thread replies directly to connected clients:

```typescript
/**
 * Broadcast a new thread reply to WebSocket clients (called when reply is published)
 */
broadcastThreadReply(channelId: string, parentId: string, message: any): void {
  const wsMessage: WebSocketMessage = {
    type: 'thread.new',
    channelId,
    parentId,
    message,
  };
  this.broadcast(wsMessage);
}
```

#### 2. Thread Reply Endpoint (`api/src/routes/messages.ts`)
Modified the `POST /messages/:id/thread` endpoint to immediately broadcast thread replies via WebSocket after publishing to Nostr:

```typescript
// Immediately broadcast the thread reply via WebSocket
const wsHandler = getWebSocketHandler();
if (wsHandler) {
  wsHandler.broadcastThreadReply(channelId, messageId, replyMessage);
}
```

This ensures that:
- Thread replies are sent to Nostr (for persistence and federation)
- Connected clients receive instant WebSocket updates
- The thread panel updates immediately without waiting for Nostr echo
- Page refreshes are no longer needed

### Flow After Fix

1. User submits thread reply
2. API publishes event to Nostr relay (kind 11 or 1111)
3. API **immediately** broadcasts to WebSocket clients ✨ NEW
4. Frontend receives WebSocket event and updates thread panel instantly
5. (Later) Nostr relay echo arrives, but is deduplicated by event ID

### Benefits

- **Instant UI updates**: Thread replies appear immediately
- **Better UX**: No need to refresh the page
- **Maintains data integrity**: Still persists to Nostr for federation
- **Graceful degradation**: If WebSocket fails, Nostr echo still works

## Testing

To test the fix:

1. Start the dev environment:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

2. Open two browser windows side by side at http://localhost:3002

3. Log in as the same user in both windows

4. In window 1:
   - Click "Reply in thread" on any message
   - Type a reply and click "Send"

5. Verify:
   - ✅ Reply appears instantly in the thread panel (window 1)
   - ✅ Thread count increments immediately on the parent message
   - ✅ No page refresh needed

6. In window 2 (if open to the same channel):
   - ✅ Thread count should update in real-time via WebSocket
   - ✅ If thread panel is open, reply should appear instantly

## Related Files

- `api/src/websocket/handler.ts` - WebSocket broadcast logic
- `api/src/routes/messages.ts` - Thread reply endpoint
- `api/src/index.ts` - WebSocket handler export
- `frontend/src/routes/+page.svelte` - Thread event handling
- `frontend/src/lib/components/ThreadPanel.svelte` - Thread UI

## Status

✅ **FIXED** - Thread replies now update in real-time via WebSocket
