# OpenClaw Integration Design

**Date:** 2026-02-16
**Status:** Approved
**Author:** Claude (with user collaboration)

## Overview

Integrate relay-chat with OpenClaw by building a native OpenClaw channel plugin. This allows OpenClaw to treat relay-chat like any other messaging platform (Discord, Slack, etc.), with each relay-chat thread mapping to an isolated OpenClaw conversation session.

## Goals

1. **Native Integration:** Build an OpenClaw plugin (not a standalone bot) so OpenClaw is the "host"
2. **Thread-based Sessions:** Each relay-chat thread = one OpenClaw session for conversation continuity
3. **Easy Provisioning:** Simple setup process for creating and configuring relay-chat bots
4. **Leverage Existing Platform:** Use relay-chat's existing bot infrastructure (tokens, channel bindings, WebSocket)

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────┐
│           OpenClaw Gateway                      │
│  (manages sessions, routes to AI providers)     │
└──────────────┬──────────────────────────────────┘
               │
               │ (plugin API)
               │
┌──────────────▼──────────────────────────────────┐
│    OpenClaw Relay-Chat Channel Plugin           │
│  - Registers "relaychat" channel                │
│  - Maps threads → sessions                      │
│  - Handles inbound/outbound messages            │
└──────────────┬──────────────────────────────────┘
               │
               │ (WebSocket + REST API)
               │
┌──────────────▼──────────────────────────────────┐
│         Relay-Chat Server                        │
│  - Bot user with token                          │
│  - Channel bindings                             │
│  - WebSocket hub + API                          │
└──────────────┬──────────────────────────────────┘
               │
               │
┌──────────────▼──────────────────────────────────┐
│            Users in Channels                     │
│  @mention bot → creates thread → OpenClaw        │
└─────────────────────────────────────────────────┘
```

### Message Flow

**Inbound (User → OpenClaw):**
1. User @mentions bot in relay-chat channel
2. Plugin receives WebSocket event (`new_message` or `new_reply`)
3. Plugin checks if bot is mentioned
4. Plugin determines session ID based on thread
5. Plugin dispatches message to OpenClaw Gateway
6. OpenClaw processes message with configured AI provider

**Outbound (OpenClaw → User):**
1. OpenClaw agent generates response
2. Calls plugin's `sendText` handler
3. Plugin posts reply to relay-chat API
4. Relay-chat broadcasts to users via WebSocket

## Plugin Structure

### File Organization

```
openclaw-plugin-relaychat/
├── openclaw.plugin.json          # Plugin manifest
├── package.json                  # Node dependencies
├── src/
│   ├── index.ts                  # Main register() function
│   ├── relay-client.ts           # WebSocket + API client for relay-chat
│   ├── session-manager.ts        # Maps threads → OpenClaw sessions
│   └── types.ts                  # TypeScript interfaces
├── README.md                     # Setup instructions
└── .gitignore
```

### Plugin Manifest (`openclaw.plugin.json`)

```json
{
  "id": "relaychat",
  "name": "Relay Chat",
  "version": "1.0.0",
  "description": "OpenClaw channel plugin for Relay Chat (self-hosted NIP-29 group chat)",
  "author": "relay-chat",
  "license": "MIT"
}
```

### Configuration

Configuration lives in OpenClaw's config file (`~/.config/openclaw/config.json`):

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "bot-token-from-admin-panel",
          "username": "claude-bot"
        }
      }
    }
  }
}
```

**Configuration Fields:**
- `url`: WebSocket endpoint for relay-chat
- `apiBase`: HTTP base URL for REST API calls
- `token`: Bot token generated via relay-chat admin panel
- `username`: Bot username for @mention matching

**Multi-Account Support:**
Users can configure multiple relay-chat servers by adding more accounts:
```json
"accounts": {
  "work": { "url": "ws://work.example.com/ws", ... },
  "personal": { "url": "ws://home.example.com/ws", ... }
}
```

## Session Management

### Thread → Session Mapping

**Core Principle:** Each relay-chat thread corresponds to one OpenClaw session.

**Session ID Format:**
```
relaychat-{accountId}-{channelId}-{threadId}
```

**Examples:**
- `relaychat-default-1-42` (account=default, channel=1, thread=42)
- `relaychat-work-5-128` (account=work, channel=5, thread=128)

### Thread Creation Logic

```typescript
if (message.parentId === null) {
  // Top-level @mention in channel
  // Bot replies to create a new thread
  const reply = await postReply(message.id, responseText)
  sessionId = `relaychat-${accountId}-${message.channelId}-${message.id}`
} else {
  // User is replying in an existing thread
  // Continue same session
  sessionId = `relaychat-${accountId}-${message.channelId}-${message.parentId}`
}
```

### Session Lifecycle

- **Creation:** First @mention in a channel creates a thread
- **Persistence:** Sessions live in OpenClaw's SQLite database
- **Survival:** Sessions persist across plugin restarts
- **Cleanup:** No explicit cleanup needed (OpenClaw manages persistence)
- **Continuation:** Users can reply to threads indefinitely

## Message Handling

### Inbound Message Processing

**WebSocket Events:**
- `new_message` - New top-level message in channel
- `new_reply` - New reply in a thread

**Processing Steps:**
1. Receive WebSocket event
2. Parse message payload
3. Check if bot's username is in `mentions` array
4. Ignore own messages (check `isBot` and `username`)
5. Strip @mention from content
6. Determine session ID
7. Extract context (username, channel, timestamp)
8. Dispatch to OpenClaw Gateway via plugin API

**Message Context Passed to OpenClaw:**
```typescript
{
  text: "stripped message content",
  sender: {
    username: "alice",
    displayName: "Alice Smith"
  },
  channel: "#general",
  timestamp: "2026-02-16T10:30:00Z"
}
```

### Outbound Message Delivery

**Plugin's `sendText` Handler:**
```typescript
outbound: {
  deliveryMode: "direct" as const,
  sendText: async ({ text, sessionId }) => {
    // Parse sessionId to get threadId
    const { channelId, threadId } = parseSessionId(sessionId)

    // Post reply to relay-chat
    const response = await relayClient.postReply(threadId, text)

    return { ok: true }
  }
}
```

**API Calls:**
- First reply: `POST /api/messages/{messageId}/reply` with `{content: text}`
- Subsequent: Same endpoint (relay-chat handles threading automatically)

### Error Handling

**WebSocket Connection:**
- Auto-reconnect with exponential backoff on disconnect
- Max backoff: 30 seconds
- Log connection status changes

**API Errors:**
- Log failed reply attempts
- Continue listening (don't crash plugin)
- Return `{ ok: false, error: ... }` to OpenClaw

**OpenClaw Gateway Errors:**
- Log dispatch failures
- Continue processing other messages

## Easy Bot Provisioning

### Setup Script

Create `scripts/setup-openclaw-bot.sh` to guide users through bot creation:

**Script Flow:**
1. Prompt for bot username and display name
2. Instruct user to:
   - Open relay-chat admin panel
   - Create bot with specified username/display name
   - Generate a token
   - Bind bot to desired channels (with read+write permissions)
3. Prompt user to paste the generated token
4. Prompt for relay-chat URL (default: `http://localhost:8080`)
5. Generate OpenClaw config snippet
6. Show plugin installation instructions

**Example Output:**
```
✓ Bot setup complete!

Add this to your OpenClaw config (~/.config/openclaw/config.json):

{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "abc123...",
          "username": "claude-bot"
        }
      }
    }
  }
}

Then install the plugin:
  openclaw plugins install openclaw-plugin-relaychat

Restart OpenClaw and you're ready!
```

### Alternative: Manual Setup

For users who prefer manual setup, provide clear README instructions:

1. Create bot in relay-chat admin panel
2. Generate token and bind to channels
3. Add configuration to OpenClaw config file
4. Install plugin via `openclaw plugins install`
5. Restart OpenClaw

## Implementation Notes

### Technology Stack

- **Language:** TypeScript (Node.js runtime)
- **WebSocket Client:** `ws` library for relay-chat connection
- **HTTP Client:** `node-fetch` or `axios` for API calls
- **OpenClaw Plugin API:** Provided by OpenClaw runtime

### Dependencies

```json
{
  "dependencies": {
    "ws": "^8.x",
    "node-fetch": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/ws": "^8.x"
  }
}
```

### Plugin Registration

```typescript
export default function register(api: PluginAPI) {
  api.logger.info("Relay Chat plugin loaded");

  const relayChannel = createRelayChannel(api);
  api.registerChannel({ plugin: relayChannel });
}
```

### Relay Client Interface

```typescript
class RelayClient {
  constructor(config: AccountConfig)

  // Connect to WebSocket and authenticate
  connect(): Promise<void>

  // Listen for messages
  onMessage(handler: (msg: Message) => void): void

  // Post a reply to a thread
  postReply(parentId: number, content: string): Promise<void>

  // Disconnect and cleanup
  disconnect(): void
}
```

## Testing Strategy

### Manual Testing
1. Create bot in relay-chat admin panel
2. Configure plugin in OpenClaw
3. Install and start plugin
4. @mention bot in a channel
5. Verify thread creation and response
6. Reply in thread and verify session continuity

### Integration Points to Verify
- WebSocket authentication with bot token
- @mention detection and filtering
- Thread creation on first reply
- Session ID mapping (thread → OpenClaw session)
- Multi-turn conversations within thread
- Reconnection on WebSocket disconnect
- Multiple channel bindings
- Bot badge display in relay-chat UI

## Future Enhancements

**Out of scope for initial implementation:**

1. **Rich Media:** Support for images, files, embeds (OpenClaw may add this)
2. **Reactions:** Allow bot to add emoji reactions
3. **Multi-Agent:** Support multiple OpenClaw agents in different channels
4. **Admin Commands:** Special @bot commands for session management (reset, list, etc.)
5. **Typing Indicators:** Show "bot is typing..." while OpenClaw processes
6. **Channel Context:** Pass recent channel history to OpenClaw for better context

## Summary

This design creates a native OpenClaw channel plugin for relay-chat that:
- Leverages relay-chat's existing bot platform
- Maps threads to OpenClaw sessions for conversation continuity
- Provides simple configuration via OpenClaw's config file
- Includes a setup script for easy bot provisioning
- Follows OpenClaw's plugin architecture patterns

The result is a seamless integration where users can @mention an OpenClaw-powered bot in relay-chat and have threaded conversations with full session persistence.
