# Development Guide

## Building from Source

### Prerequisites

- Node.js 18+ and npm
- TypeScript 5+

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/openclaw-plugin-relaychat.git
cd openclaw-plugin-relaychat

# Install dependencies
npm install

# Build
npm run build
```

### Development Workflow

```bash
# Watch mode (rebuilds on file changes)
npm run watch

# Link for local testing
openclaw plugins install -l ./path/to/openclaw-plugin-relaychat
```

## Project Structure

```
openclaw-plugin-relaychat/
├── src/
│   ├── index.ts              # Plugin entry point (register function)
│   ├── channel.ts            # Channel plugin definition
│   ├── relay-client.ts       # WebSocket + REST client
│   ├── session-manager.ts    # Thread → session mapping
│   └── types.ts              # TypeScript interfaces
├── scripts/
│   └── setup-bot.sh          # Interactive setup helper
├── openclaw.plugin.json      # Plugin manifest
├── package.json              # npm config
├── tsconfig.json             # TypeScript config
└── README.md                 # User documentation
```

## Architecture

### Message Flow (Inbound)

1. User @mentions bot in relay-chat
2. `RelayClient` receives WebSocket event
3. Message handler filters for @mentions
4. `SessionManager` generates session ID from thread
5. Message dispatched to OpenClaw Gateway (TODO: API integration)
6. OpenClaw processes with AI provider

### Message Flow (Outbound)

1. OpenClaw agent generates response
2. Calls `channel.outbound.sendText()`
3. `SessionManager` parses session ID
4. `RelayClient.postReply()` POSTs to relay-chat API
5. Relay-chat broadcasts to users

### Session Management

**Mapping Strategy:**
- Top-level @mention → creates thread (bot replies to message)
- Thread ID = parent message ID
- Session ID = `relaychat-{account}-{channel}-{thread}`

**Persistence:**
- Sessions stored in OpenClaw's SQLite database
- Survives plugin restarts
- No explicit cleanup needed

### WebSocket Reconnection

- Exponential backoff (1s → 2s → 4s → ... → 30s max)
- Max 10 attempts before giving up
- Automatic on connection drop (unless intentionally closed)

## Testing

### Manual Testing

1. Start relay-chat server locally
2. Create a bot via admin panel
3. Configure plugin with bot token
4. Link plugin for development
5. Restart OpenClaw
6. @mention bot in a channel
7. Verify thread creation and response

### Integration Points

- [ ] WebSocket authentication with bot token
- [ ] @mention detection and filtering
- [ ] Ignoring own messages
- [ ] Thread creation on first reply
- [ ] Session ID generation and parsing
- [ ] Multi-turn conversation in thread
- [ ] Reconnection after disconnect
- [ ] Multiple account support
- [ ] Error handling (API failures, network issues)

## TODO

### High Priority

- [ ] Implement actual OpenClaw dispatch API (currently placeholder)
- [ ] Get OpenClaw config within plugin (depends on plugin API docs)
- [ ] Test with real OpenClaw instance
- [ ] Add unit tests for SessionManager
- [ ] Add integration tests

### Medium Priority

- [ ] Support for rich media (images, embeds) if OpenClaw adds support
- [ ] Typing indicators ("bot is typing...")
- [ ] Better error messages to users
- [ ] Metrics/logging for debugging

### Low Priority

- [ ] Admin commands (@bot reset, @bot help, etc.)
- [ ] Multi-agent support (different bots in different channels)
- [ ] Channel context (pass recent messages for better responses)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test locally
5. Submit a pull request

## OpenClaw Plugin API Notes

**Current Gaps:**
- Actual message dispatch API to OpenClaw Gateway
- Config access mechanism within plugin
- Plugin lifecycle hooks (startup, shutdown)

These will be filled in once OpenClaw plugin documentation is available.

## License

MIT
