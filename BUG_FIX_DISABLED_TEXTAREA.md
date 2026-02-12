# Bug Fix: Disabled Textarea in #general

## Issue
The message input textarea in #general was disabled on production (chat.brakke.cc). Users couldn't type on desktop or mobile, and the keyboard wouldn't pop up on mobile.

## Root Cause
The bug was in `/frontend/src/lib/websocket.ts`. The WebSocket URL was being computed at module-load time:

```typescript
const WS_URL = getWebSocketUrl();  // ❌ Called at module load (SSR)
```

During SSR (server-side rendering), the `browser` check returns `false`, so `getWebSocketUrl()` would return the server-side default `'ws://localhost:4000/ws'`. This value was then baked into the module for both server AND client.

When the client hydrated, it would use this incorrect WebSocket URL instead of computing the correct one based on `window.location` (which should be `wss://chat.brakke.cc/ws`).

This caused the WebSocket connection to fail on the client, leading to JavaScript errors that broke Svelte's reactivity system and left the textarea stuck in a disabled state.

## Solution
Made the WebSocket URL computation lazy by removing the module-level constant and calling `getWebSocketUrl()` inside the `connect()` method:

```typescript
// Before (WRONG):
const WS_URL = getWebSocketUrl();  // Computed at module load

connect(): void {
  const url = this.token ? `${WS_URL}?token=...` : WS_URL;
  // ...
}

// After (CORRECT):
connect(): void {
  const wsUrl = getWebSocketUrl();  // Computed at runtime
  const url = this.token ? `${wsUrl}?token=...` : wsUrl;
  // ...
}
```

Now `getWebSocketUrl()` is called at runtime (on the client), ensuring it uses the correct `window.location` to build the WebSocket URL.

## Files Changed
- `frontend/src/lib/websocket.ts` - Removed module-level `WS_URL` constant, moved computation to `connect()` method

## Testing
To verify the fix works:

1. Navigate to https://chat.brakke.cc/
2. Sign up or log in
3. Navigate to #general
4. **Check**: The textarea should NOT have the `disabled` attribute
5. **Test**: Type a message - the textarea should accept input
6. **Test Mobile**: On mobile, tapping the textarea should bring up the keyboard
7. **Check Console**: Open browser DevTools Console - there should be no WebSocket connection errors

Expected console output:
```
WebSocket connected
WebSocket authenticated: { user: ... }
```

NOT:
```
WebSocket error: Failed to connect to ws://localhost:4000/ws
```

## Commit
Commit: `48d1283`
Message: "Fix WebSocket URL computation during hydration"

## Deployment
Pushed to master on 2026-02-12. Automatic deployment to Fly.io via CI/CD pipeline should follow.
