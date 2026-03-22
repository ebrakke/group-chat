# Typing Indicators Design

## Overview

Add real-time typing indicators to channels, DMs, and threads. When a user types in a message input, other users viewing the same context see "Alex is typing..." text above the input area.

## Approach

Server-relayed typing events over the existing WebSocket connection. The client sends a `typing` event when the user types; the Go backend parses it, attaches user metadata, and broadcasts to other clients. No persistence, no HTTP endpoints.

## Protocol

### Client-to-Server (new — WS is currently one-directional)

The client sends JSON over the existing WebSocket connection:

```json
{ "type": "typing", "channelId": 5, "parentId": null }
```

- `channelId` (required): The channel where the user is typing.
- `parentId` (optional/null): If typing in a thread, the parent message ID. Null for top-level channel/DM messages.

### Server-to-Client (broadcast)

The server broadcasts to other users in the same channel:

```json
{
  "type": "user_typing",
  "payload": {
    "channelId": 5,
    "parentId": null,
    "userId": 12,
    "displayName": "Alex"
  }
}
```

The server excludes the sender and respects existing DM filtering (only the two DM participants receive the event).

## Backend Changes

### `internal/ws/ws.go`

**Modify the read loop** (lines 98-104) to parse incoming JSON messages and handle the `typing` type:

```go
// Current: discard incoming messages
for {
    var msg string
    if err := websocket.Message.Receive(conn, &msg); err != nil {
        return
    }
}

// New: parse and dispatch incoming events
for {
    var msg string
    if err := websocket.Message.Receive(conn, &msg); err != nil {
        return
    }
    h.handleClientMessage(c, msg)
}
```

**Add `handleClientMessage` method** on `Hub`:

1. Parse JSON into `{ type, channelId, parentId }`.
2. Switch on `type`:
   - `"typing"`: Call `h.broadcastTyping(c, channelId, parentId)`.
   - Unknown types: Ignore silently.

**Add `broadcastTyping` method**:

1. Look up the sender's display name via a new `GetDisplayNameFunc func(userID int64) string` on the Hub (set by the app at startup, same pattern as `AuthFunc`).
2. Build a `user_typing` event with `{ channelId, parentId, userId, displayName }`.
3. Broadcast using the existing `Broadcast` method but skip the sender. To do this, add a new `BroadcastExcluding(ev Event, excludeUserID int64)` method (or add an `ExcludeUserID` field to `Event`).

**Server-side rate limiting**: Ignore typing events from the same user+channel+parentId if the last one was received less than 2 seconds ago. This prevents a fast typer from flooding broadcasts. Use a `map[string]time.Time` keyed by `"userID:channelID:parentID"`, protected by a dedicated `sync.Mutex` (the read loop runs in per-client goroutines, so concurrent map access requires synchronization). Clean up stale entries every 60 seconds via a background goroutine started in `NewHub()`.

```go
typingMu   sync.Mutex
typingLast map[string]time.Time
```

**Bot filtering**: Ignore typing events from bot clients (`if c.isBot { return }` at the top of `handleClientMessage`).

**Sender exclusion**: Add an `ExcludeUserID int64` field to the `Event` struct (with `json:"-"` tag). In `Broadcast`, skip clients where `c.userID == ev.ExcludeUserID`. This avoids duplicating broadcast logic into a separate method.

### `cmd/app/main.go` (or wherever the hub is wired)

Set `hub.GetDisplayNameFunc` to a function that queries the user service/DB for display names. Can cache aggressively since display names change rarely.

## Frontend Changes

### 1. `frontend/src/lib/ws.svelte.ts` — Send typing events

Add a `sendTyping(channelId: number, parentId: number | null)` method to `WebSocketManager`:

- Sends `{ type: "typing", channelId, parentId }` over the WS connection via `this.ws.send()`.
- Client-side throttle: Skip if the last send for this channelId+parentId was less than 2 seconds ago. Use a simple `Map<string, number>` of last-send timestamps.
- Error handling: Wrap `this.ws.send()` in try/catch and silently swallow errors (typing is non-critical; the connection may be closing).

### 2. `frontend/src/lib/stores/typing.svelte.ts` — New typing store

A Svelte 5 runes store that tracks who is typing where:

```typescript
class TypingStore {
  // Map key: "channelId" or "channelId:parentId"
  // Map value: Map<userId, { displayName, expiresAt }>
  private typers = $state(new Map<string, Map<number, { displayName: string; timer: ReturnType<typeof setTimeout> }>>());

  /** Called when a user_typing WS event arrives. */
  addTyper(channelId: number, parentId: number | null, userId: number, displayName: string) {
    // Set/reset a 3-second timeout — if no new typing event arrives, remove the typer.
  }

  /** Get formatted typing text for a context, e.g. "Alex is typing..." */
  getTypingText(channelId: number, parentId: number | null): string {
    // 1 user: "Alex is typing..."
    // 2 users: "Alex and Jamie are typing..."
    // 3+ users: "Several people are typing..."
    // No one: "" (empty string)
  }

  /** Clear all typers for a context (e.g., when leaving a channel). */
  clear(channelId: number, parentId: number | null) { ... }
}
```

Each typer entry has a 3-second auto-expire timer. When a new `user_typing` event arrives for the same user, the timer resets. This means typing indicators disappear 3 seconds after the user stops typing, with no explicit "stop_typing" event needed.

### 3. `frontend/src/lib/ws.svelte.ts` — Handle incoming `user_typing` events

Add a case to `handleEvent()`:

```typescript
case 'user_typing':
  if (payload) {
    typingStore.addTyper(payload.channelId, payload.parentId, payload.userId, payload.displayName);
  }
  break;
```

### 4. `frontend/src/lib/components/MessageInput.svelte` — Emit typing events

Add new props:

- `channelId: number` — the channel context
- `parentId?: number | null` — thread parent (null for top-level)

In `handleInput()`, after existing logic, call `wsManager.sendTyping(channelId, parentId)` (the throttle is inside wsManager).

On `send()`, clear the typing state for this user (the 3-second timeout handles it, but clearing immediately feels snappier for other users since the new message arrival implicitly signals the user stopped typing).

### 5. `frontend/src/lib/components/TypingIndicator.svelte` — New display component

A simple component that shows the typing text:

```svelte
<script lang="ts">
  import { typingStore } from '$lib/stores/typing.svelte';

  let { channelId, parentId = null }: { channelId: number; parentId?: number | null } = $props();

  let text = $derived(typingStore.getTypingText(channelId, parentId));
</script>

<div class="px-4 h-5 text-[11px] font-mono" style="color: var(--rc-timestamp);">
  {text}
</div>
```

The outer div always renders with a fixed height (`h-5` / 20px) to prevent layout shift. When no one is typing, it renders as an empty spacer.

### 6. Integration into chat views

**`channels/[id]/+page.svelte`**: Add `<TypingIndicator channelId={channelId} />` between `<MessageList>` and `<MessageInput>`. Pass `channelId` to `<MessageInput>`.

**`dms/[id]/+page.svelte`**: Same pattern, using the DM's `channelId`.

**`ThreadPanel.svelte`**: Add `<TypingIndicator channelId={channelId} parentId={threadStore.openThreadId} />` between the replies list and the reply input. Pass both `channelId` and `parentId` to `<MessageInput>`. The `channelId` comes from `parentMessage.channelId` (available on the thread's parent message). ThreadPanel needs both changes: adding the TypingIndicator component and passing channelId/parentId to its MessageInput.

## Display Rules

- **1 user**: "Alex is typing..."
- **2 users**: "Alex and Jamie are typing..."
- **3+ users**: "Several people are typing..."
- **Empty**: Component renders an empty placeholder (fixed height to prevent jank)
- **Own typing**: Excluded server-side (sender is never broadcast to)

## Timing

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Client send throttle | 2s | Prevents spamming the server while still feeling responsive |
| Server rate limit | 2s per user+channel+parent | Prevents relay of redundant events |
| Client-side expiry | 3s | Indicator disappears 3s after last typing event; short enough to feel accurate |

## Edge Cases

- **User disconnects while typing**: Their WS connection closes, no more typing events arrive, the 3-second expiry clears them automatically.
- **User sends a message**: The `new_message` / `new_reply` event implicitly signals they stopped typing. The typing store should clear the user from the typing map when a `new_message` (using `payload.userId`) or `new_reply` (using `payload.userId` + `payload.parentId`) arrives. The `userId` field is always present in enriched message payloads from the backend.
- **User switches channels**: The old channel stops receiving typing events (the throttle resets), and the 3-second timeout clears the indicator. Additionally, `typingStore.clear(channelId, null)` is called in the channel/DM page `$effect` cleanup when `channelId` changes, to avoid briefly showing stale state on return.
- **Multiple tabs**: Each tab has its own WS connection and sends its own typing events. This is fine — duplicate broadcasts for the same user are deduplicated by userId in the typing store.

## Files Changed

### New files
- `frontend/src/lib/stores/typing.svelte.ts` — Typing store
- `frontend/src/lib/components/TypingIndicator.svelte` — Display component

### Modified files
- `internal/ws/ws.go` — Bidirectional WS, typing event handling, rate limiting
- `cmd/app/main.go` — Wire `GetDisplayNameFunc` on hub
- `frontend/src/lib/ws.svelte.ts` — `sendTyping()` method, `user_typing` event handler
- `frontend/src/lib/components/MessageInput.svelte` — Accept channelId/parentId props, emit typing on input
- `frontend/src/routes/(app)/channels/[id]/+page.svelte` — Add TypingIndicator, pass channelId to MessageInput
- `frontend/src/routes/(app)/dms/[id]/+page.svelte` — Same
- `frontend/src/lib/components/ThreadPanel.svelte` — Same, with parentId

## Non-Goals

- Animated dots or bubble indicators
- "X is typing" in channel/DM list sidebar
- Typing indicators for bot users
- Persistence of typing state
