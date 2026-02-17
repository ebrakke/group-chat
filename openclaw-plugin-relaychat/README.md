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
- Bot token from your relay-chat instance (see "Creating a Bot Token" below)

## Installation Methods

### Method 1: Pre-built Zip (Easiest)

If you received a pre-built plugin zip file:

1. **Extract the zip**:
   ```bash
   unzip openclaw-plugin-relaychat.zip
   cd openclaw-plugin-relaychat
   ```

2. **Run the installer**:
   ```bash
   ./install.sh
   ```

   Or manually install:
   ```bash
   mkdir -p ~/.openclaw/extensions/openclaw-plugin-relaychat
   cp -r dist package.json openclaw.plugin.json ~/.openclaw/extensions/openclaw-plugin-relaychat/
   cd ~/.openclaw/extensions/openclaw-plugin-relaychat
   npm install --production
   ```

3. **Configure** `~/.openclaw/openclaw.json`:
   ```json
   {
     "channels": {
       "relaychat": {
         "accounts": {
           "main": {
             "enabled": true,
             "url": "wss://chat.example.com/ws",
             "apiBase": "https://chat.example.com/api",
             "token": "your-bot-token-here",
             "username": "your-bot-username"
           }
         }
       }
     }
   }
   ```

4. **Restart OpenClaw**:
   ```bash
   systemctl restart openclaw  # or manually restart
   ```

5. **Verify**:
   ```bash
   openclaw status  # Should show relaychat plugin loaded
   tail -f ~/.openclaw/logs/openclaw.log  # Watch for connection
   ```

### Method 2: Build from Source

### 1. Build the Plugin

```bash
cd openclaw-plugin-relaychat
npm install
npm run build
```

This creates `dist/index.js` - the compiled plugin.

### 2. Install to OpenClaw

Copy the built plugin to OpenClaw's extensions directory:

```bash
mkdir -p ~/.openclaw/extensions/openclaw-plugin-relaychat
cp -r dist package.json openclaw.plugin.json ~/.openclaw/extensions/openclaw-plugin-relaychat/
cd ~/.openclaw/extensions/openclaw-plugin-relaychat
npm install --production
```

### 3. Configure OpenClaw

Edit `~/.openclaw/openclaw.json` and add your relay-chat connection:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "main": {
          "enabled": true,
          "url": "wss://chat.example.com/ws",
          "apiBase": "https://chat.example.com/api",
          "token": "your-bot-token-here",
          "username": "your-bot-username"
        }
      }
    }
  }
}
```

**Configuration Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| `enabled` | Enable/disable this account | `true` |
| `url` | WebSocket URL (must include `/ws` path) | `wss://chat.example.com/ws` |
| `apiBase` | HTTP base URL with `/api` path | `https://chat.example.com/api` |
| `token` | Bot token from relay-chat | `2d15b3ed8376f22...` |
| `username` | Bot username for @mention detection | `openclaw` |

**Important:**
- `url` must use `ws://` (local) or `wss://` (production) protocol and include `/ws` path
- `apiBase` must include the `/api` path
- `username` must match the bot's username in relay-chat (case-insensitive)

### 4. Restart OpenClaw

```bash
# If running as a service
systemctl restart openclaw

# Or if running manually
# Stop OpenClaw (Ctrl+C) and start again
openclaw start
```

### 5. Verify Connection

Check OpenClaw logs to confirm connection:

```bash
tail -f ~/.openclaw/logs/openclaw.log
```

You should see:
```
Initializing relay-chat account: main
Connected to relay-chat account: main
Relay Chat channel registered successfully
```

## Creating a Bot Token

Your relay-chat administrator needs to create a bot account for OpenClaw:

1. **Access Admin Panel**: Navigate to your relay-chat admin interface
2. **Create Bot**: Go to Bots section and create a new bot
   - Username: Choose a name (e.g., `openclaw`, `claude-bot`)
   - Display Name: Optional (e.g., `Claude AI`)
3. **Generate Token**: Save the generated token securely
4. **Bind to Channels**: Give the bot access to channels where it should respond
   - Permissions needed: Read messages, Send messages

**Example using the echo-bot as reference:**

See [examples/echo-bot](../../examples/echo-bot) in the relay-chat repository for the reference bot implementation.

**Production Example:**

For a live relay-chat instance at `https://chat.brakke.cc`:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "main": {
          "enabled": true,
          "url": "wss://chat.brakke.cc/ws",
          "apiBase": "https://chat.brakke.cc/api",
          "token": "2d15b3ed8376f227b0efdf81c3e5f058412612f2785160050a1643d1b9636a23",
          "username": "openclaw"
        }
      }
    }
  }
}
```

This connects to the production relay-chat server using WSS (secure WebSocket) and HTTPS for API calls.

## Testing the Integration

1. **Join a Channel**: Open your relay-chat client and go to a channel where the bot is bound
2. **Mention the Bot**: Send a message with `@your-bot-username hello!`
3. **Expect Reply**: The bot should reply in a thread with an AI-generated response
4. **Continue Conversation**: Reply in the thread to continue the same session

## Advanced Configuration

### Multiple Accounts

Connect to different relay-chat servers simultaneously:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "work": {
          "enabled": true,
          "url": "wss://work.example.com/ws",
          "apiBase": "https://work.example.com/api",
          "token": "work-bot-token",
          "username": "work-claude"
        },
        "personal": {
          "enabled": true,
          "url": "wss://home.example.com/ws",
          "apiBase": "https://home.example.com/api",
          "token": "personal-bot-token",
          "username": "personal-claude"
        }
      }
    }
  }
}
```

Each account connects to a separate relay-chat instance with its own WebSocket connection and session management.

### Disabling an Account

Set `enabled: false` to temporarily disable an account without removing the configuration:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "main": {
          "enabled": false,
          "url": "wss://chat.example.com/ws",
          "apiBase": "https://chat.example.com/api",
          "token": "...",
          "username": "openclaw"
        }
      }
    }
  }
}
```

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

### Plugin not loading

**Symptom**: Plugin doesn't appear in `openclaw status`

**Solutions**:
1. Verify plugin files are in `~/.openclaw/extensions/openclaw-plugin-relaychat/`
2. Check that `dist/index.js`, `package.json`, and `openclaw.plugin.json` are present
3. Rebuild the plugin: `npm run build`
4. Restart OpenClaw completely

### WebSocket 403 Forbidden

**Symptom**: Logs show "Unexpected server response: 403"

**Cause**: Missing or invalid bot token

**Solutions**:
1. Verify the token in `openclaw.json` matches the token from relay-chat admin
2. Check that the bot has been created and activated in relay-chat
3. Ensure the token hasn't expired or been revoked

### Health check failing but WebSocket connects

**Symptom**: Warning about health check failure, but connection succeeds

**Cause**: Health check endpoint may not be available on all relay-chat deployments

**Solution**: This is normal - the plugin will continue with WebSocket connection. If messages are working, you can ignore this warning.

### Bot not responding to @mentions

**Symptom**: You @mention the bot but get no reply

**Solutions**:
1. **Username mismatch**: Verify `username` in config matches bot username exactly (case-insensitive)
   ```bash
   # Check OpenClaw logs for:
   Received @mention from <user> in channel <id>
   ```
2. **Bot not bound to channel**: Ensure relay-chat admin has bound the bot to the channel
3. **Wrong @mention format**: Use `@botname` not `@botname:` or other variations
4. **Check OpenClaw processing**:
   ```bash
   tail -f ~/.openclaw/logs/openclaw.log | grep -i relay
   ```

### Connection keeps dropping

**Symptom**: WebSocket disconnects frequently

**Cause**: Network issues or server restarts

**Solution**: The plugin auto-reconnects with exponential backoff (max 10 attempts, up to 30s delay). If it fails to reconnect:
1. Check network connectivity to relay-chat server
2. Verify WebSocket URL is accessible: `wscat -c wss://chat.example.com/ws`
3. Check relay-chat server logs for errors
4. Restart OpenClaw to reset connection attempts

### 404 errors on API calls

**Symptom**: Logs show 404 errors when posting replies

**Cause**: Incorrect `apiBase` configuration

**Solution**: Ensure `apiBase` includes `/api` path:
- ✅ Correct: `https://chat.example.com/api`
- ❌ Wrong: `https://chat.example.com`

### Messages received but no OpenClaw response

**Symptom**: Logs show "Received @mention" but no "Posted reply"

**Solutions**:
1. Check OpenClaw agent is configured and running
2. Verify OpenClaw Gateway is processing messages
3. Check for errors in OpenClaw dispatch:
   ```bash
   tail -f ~/.openclaw/logs/openclaw.log | grep -i error
   ```
4. Restart OpenClaw to reset session state

## Creating a Distributable Plugin

To create a zip file for sharing with other OpenClaw instances:

**Quick method** (recommended):
```bash
./make-release.sh
```

This creates `openclaw-plugin-relaychat-vX.Y.Z.zip` with the current version from `package.json`.

**Manual method**:

1. **Build the plugin**:
   ```bash
   npm install
   npm run build
   ```

2. **Create zip with required files**:
   ```bash
   zip -r openclaw-plugin-relaychat.zip \
     dist/ \
     package.json \
     openclaw.plugin.json \
     install.sh \
     README.md \
     QUICKSTART.md
   ```

3. **Share the zip** with other users along with:
   - Relay-chat server URL (e.g., `https://chat.example.com`)
   - Instructions for creating a bot token
   - Bot username to use

Recipients can then:
```bash
unzip openclaw-plugin-relaychat.zip
cd openclaw-plugin-relaychat
./install.sh
# Follow prompts to configure
```

**What's included in the zip:**
- `dist/index.js` - Compiled plugin code
- `package.json` - Plugin metadata and dependencies
- `openclaw.plugin.json` - OpenClaw plugin manifest
- `install.sh` - Automated installation script
- `README.md` - Complete setup instructions and troubleshooting
- `QUICKSTART.md` - Quick reference for installation

## For Maintainers

See [DISTRIBUTION.md](./DISTRIBUTION.md) for:
- Creating release packages
- Distribution best practices
- Version management
- Security guidelines

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
