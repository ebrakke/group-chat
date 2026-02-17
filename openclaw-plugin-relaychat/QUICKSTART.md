# Quick Start Guide

## Prerequisites

- ✅ OpenClaw installed and running
- ✅ Relay-chat server URL (e.g., `https://chat.example.com`)
- ✅ Bot token from relay-chat admin

## Installation (3 steps)

### 1. Install the plugin

```bash
./install.sh
```

This copies the plugin to `~/.openclaw/extensions/openclaw-plugin-relaychat/`

### 2. Configure OpenClaw

Edit `~/.openclaw/openclaw.json`:

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
- `YOUR-CHAT-SERVER` → Your relay-chat domain (e.g., `chat.example.com`)
- `YOUR-BOT-TOKEN` → Token from relay-chat admin panel
- `YOUR-BOT-USERNAME` → Bot username (e.g., `openclaw`)

### 3. Restart OpenClaw

```bash
systemctl restart openclaw
# or manually stop and start if not using systemd
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
