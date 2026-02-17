# Quick Start Guide

## Prerequisites

- ✅ OpenClaw installed and running
- ✅ Relay-chat server URL (e.g., `https://chat.example.com`)
- ✅ Bot token from relay-chat admin

## Installation (2 steps)

### 1. Run the installer

```bash
./install.sh
```

This automatically:
- Copies plugin to `~/.openclaw/extensions/openclaw-plugin-relaychat/`
- Installs dependencies (`ws`, `node-fetch`)
- Enables plugin in OpenClaw config
- Creates config backup

### 2. Add relay-chat server details

Edit `~/.openclaw/openclaw.json` and add to the `channels` section:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "main": {
          "enabled": true,
          "url": "wss://YOUR-CHAT-SERVER/ws",
          "apiBase": "https://YOUR-CHAT-SERVER/api",
          "token": "YOUR-BOT-TOKEN",
          "username": "YOUR-BOT-USERNAME"
        }
      }
    }
  }
}
```

**Replace:**
- `YOUR-CHAT-SERVER` → Your relay-chat domain (e.g., `chat.brakke.cc`)
- `YOUR-BOT-TOKEN` → Token from relay-chat admin panel
- `YOUR-BOT-USERNAME` → Bot username (e.g., `openclaw`)

**Example for production:**
```json
"url": "wss://chat.brakke.cc/ws",
"apiBase": "https://chat.brakke.cc/api",
"token": "2d15b3ed8376f227b0ef...",
"username": "openclaw"
```

### 3. Restart OpenClaw

```bash
systemctl restart openclaw
# or: pkill openclaw-gateway && openclaw-gateway &
```

## Verify It's Working

```bash
# Check plugin is loaded
openclaw status

# Watch logs for connection
tail -f ~/.openclaw/logs/openclaw.log

# Look for:
# ✓ "Relay Chat channel registered successfully"
# ✓ "Connected to relay-chat account: main"
```

## Test the Bot

1. Open relay-chat in your browser
2. Go to any channel the bot has access to
3. Send a message: `@your-bot-username hello!`
4. Bot should reply in a thread

## Common Issues

### "403 Forbidden" on WebSocket

→ Check bot token is correct in `openclaw.json`

### Bot doesn't respond to @mentions

→ Verify `username` in config matches bot username exactly

### Plugin not loading

→ Run `./install.sh` again and check file permissions

### Connection keeps dropping

→ Check `url` and `apiBase` point to correct server
→ Verify server is accessible: `curl https://YOUR-CHAT-SERVER/api/health`

## Need Help?

See [README.md](./README.md) for detailed documentation and troubleshooting.
