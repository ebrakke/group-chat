# OpenClaw Relay Chat Plugin

OpenClaw channel plugin for [Relay Chat](https://github.com/ebrakke/relay-chat) - a self-hosted, private group chat built on Nostr infrastructure.

## Features

- **Native Integration**: Relay-chat appears as a channel in OpenClaw (like Discord, Slack, etc.)
- **Thread-based Sessions**: Each relay-chat thread = one OpenClaw conversation session
- **Persistent Conversations**: Sessions survive plugin restarts (stored in OpenClaw's database)
- **Multi-Account Support**: Connect to multiple relay-chat servers simultaneously
- **Real-time Communication**: WebSocket-based message delivery with auto-reconnection

## Prerequisites

- OpenClaw installed and running
- Relay-chat server (self-hosted or remote)
- Admin access to create bots in relay-chat

## Installation

### Option 1: Quick Setup (Recommended)

1. Clone or download this plugin
2. Run the setup script:
   ```bash
   ./scripts/setup-bot.sh
   ```
3. Follow the interactive prompts to:
   - Create a bot in relay-chat
   - Generate configuration
   - Get installation instructions

### Option 2: Manual Setup

1. **Create a bot in relay-chat:**
   - Open your relay-chat admin panel
   - Navigate to "Bots" section
   - Create a new bot (username: `claude-bot`, display name: `Claude`)
   - Generate a token
   - Bind the bot to desired channels (read+write permissions)

2. **Configure OpenClaw:**

   Edit `~/.config/openclaw/config.json` and add:

   ```json
   {
     "channels": {
       "relaychat": {
         "accounts": {
           "default": {
             "enabled": true,
             "url": "ws://localhost:8080/ws",
             "apiBase": "http://localhost:8080",
             "token": "your-bot-token-here",
             "username": "claude-bot"
           }
         }
       }
     }
   }
   ```

3. **Install the plugin:**
   ```bash
   openclaw plugins install openclaw-plugin-relaychat
   ```

   Or for local development:
   ```bash
   openclaw plugins install -l ./path/to/openclaw-plugin-relaychat
   ```

4. **Restart OpenClaw**

## Configuration

### Single Account

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "bot-token",
          "username": "claude-bot"
        }
      }
    }
  }
}
```

### Multiple Accounts

Connect to different relay-chat servers:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "work": {
          "enabled": true,
          "url": "ws://work.example.com/ws",
          "apiBase": "https://work.example.com",
          "token": "work-bot-token",
          "username": "work-claude"
        },
        "personal": {
          "enabled": true,
          "url": "ws://home.example.com/ws",
          "apiBase": "https://home.example.com",
          "token": "personal-bot-token",
          "username": "personal-claude"
        }
      }
    }
  }
}
```

### Configuration Fields

| Field | Description |
|-------|-------------|
| `enabled` | Enable/disable this account |
| `url` | WebSocket URL (must start with `ws://` or `wss://`) |
| `apiBase` | HTTP base URL for REST API calls |
| `token` | Bot token from relay-chat admin panel |
| `username` | Bot username for @mention matching |

## Usage

1. **Start a conversation:**
   - In relay-chat, @mention the bot in any channel: `@claude-bot hello!`
   - Bot creates a thread by replying
   - This thread becomes an OpenClaw session

2. **Continue the conversation:**
   - Reply in the thread to continue the same session
   - OpenClaw maintains full conversation history
   - Sessions persist across restarts

3. **Multiple conversations:**
   - Each thread is isolated
   - @mention the bot again in the channel to start a new conversation

## How It Works

```
User @mentions bot in channel
         ↓
Plugin receives WebSocket event
         ↓
Plugin creates/identifies session (thread ID)
         ↓
Message dispatched to OpenClaw Gateway
         ↓
AI agent processes with full session context
         ↓
Response sent back via plugin
         ↓
Bot posts reply in thread
         ↓
User sees response in relay-chat
```

**Session ID Format:** `relaychat-{accountId}-{channelId}-{threadId}`

Example: `relaychat-default-1-42`
- Account: `default`
- Channel ID: `1`
- Thread ID: `42` (parent message ID)

## Troubleshooting

### Plugin not connecting

1. Check OpenClaw logs for errors
2. Verify relay-chat server is accessible
3. Test with health check: `curl http://localhost:8080/api/health`
4. Verify bot token is correct
5. Check bot has channel bindings with read+write permissions

### Bot not responding

1. Ensure you're @mentioning the correct username
2. Check bot is bound to the channel
3. Verify OpenClaw is processing messages (check logs)
4. Try in a new thread

### Connection drops

The plugin automatically reconnects with exponential backoff:
- Max attempts: 10
- Max delay: 30 seconds
- Check network connectivity to relay-chat server

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for:
- Building from source
- Running tests
- Contributing guidelines
- Plugin architecture details

## License

MIT

## Credits

Built for [Relay Chat](https://github.com/ebrakke/relay-chat) and [OpenClaw](https://github.com/openclaw/openclaw).
