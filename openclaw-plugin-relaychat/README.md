# OpenClaw Relay Chat Plugin

OpenClaw channel plugin for [Relay Chat](https://github.com/ebrakke/relay-chat) - a self-hosted, private group chat built on Nostr infrastructure.

## Features

- Native OpenClaw channel integration
- Thread-based session mapping (each thread = one OpenClaw session)
- Real-time WebSocket communication
- Multi-account support

## Installation

```bash
openclaw plugins install openclaw-plugin-relaychat
```

## Configuration

Add to your OpenClaw config (`~/.config/openclaw/config.json`):

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws",
          "apiBase": "http://localhost:8080",
          "token": "your-bot-token",
          "username": "claude-bot"
        }
      }
    }
  }
}
```

### Configuration Fields

- `url`: WebSocket endpoint for relay-chat
- `apiBase`: HTTP base URL for REST API calls
- `token`: Bot token from relay-chat admin panel
- `username`: Bot username for @mention matching

## Setup

1. Create a bot in your relay-chat admin panel
2. Generate a token for the bot
3. Bind the bot to desired channels (read+write permissions)
4. Add configuration to OpenClaw config
5. Install this plugin
6. Restart OpenClaw

## How It Works

- User @mentions the bot in a relay-chat channel
- Plugin creates a thread by replying to the message
- Each thread maps to one OpenClaw session
- All replies in that thread continue the same conversation
- Sessions persist in OpenClaw's database across restarts

## License

MIT
