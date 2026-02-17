# Example Configuration with Reactions

Here's a complete example of how to configure the relay-chat plugin with reaction support:

## Basic Configuration (with reactions)

Add this to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-plugin-relaychat": {
        "enabled": true
      }
    }
  },
  "channels": {
    "relaychat": {
      "accounts": {
        "main": {
          "enabled": true,
          "url": "wss://chat.example.com/ws",
          "apiBase": "https://chat.example.com/api",
          "token": "your-bot-token-from-relay-chat",
          "username": "claude",
          "reactOnMention": "👀"
        }
      }
    }
  }
}
```

## Configuration Options

### reactOnMention (Optional)

The `reactOnMention` field controls whether the bot reacts with an emoji when mentioned.

**Examples:**

```json
"reactOnMention": "👀"     // React with eyes emoji
"reactOnMention": "eyes"   // Same as above (emoji shortcode)
"reactOnMention": "👍"     // React with thumbs up
"reactOnMention": "✅"     // React with check mark
"reactOnMention": "🤖"     // React with robot emoji
```

**Omit to disable reactions:**

```json
{
  "enabled": true,
  "url": "wss://chat.example.com/ws",
  "apiBase": "https://chat.example.com/api",
  "token": "your-bot-token",
  "username": "claude"
  // No reactOnMention = no reactions
}
```

## How It Works

When someone mentions your bot in a relay-chat channel:

1. **User sends:** `@claude hello!`
2. **Bot reacts:** Adds 👀 emoji to the message (if `reactOnMention` is configured)
3. **Bot processes:** Sends the message to OpenClaw AI
4. **Bot replies:** Posts AI response in a thread

The reaction happens immediately to acknowledge receipt, while the AI processes in the background.

## Multiple Accounts Example

You can configure different reactions for different accounts:

```json
{
  "channels": {
    "relaychat": {
      "accounts": {
        "work": {
          "enabled": true,
          "url": "wss://work.example.com/ws",
          "apiBase": "https://work.example.com/api",
          "token": "work-token",
          "username": "work-bot",
          "reactOnMention": "💼"  // Work briefcase emoji
        },
        "personal": {
          "enabled": true,
          "url": "wss://home.example.com/ws",
          "apiBase": "https://home.example.com/api",
          "token": "personal-token",
          "username": "home-bot",
          "reactOnMention": "🏠"  // House emoji
        }
      }
    }
  }
}
```

## Emoji Reference

Common emojis you might want to use:

| Emoji | Shortcode | Description |
|-------|-----------|-------------|
| 👀 | `eyes` | Watching/reading |
| 👍 | `+1` or `thumbsup` | Acknowledged |
| ✅ | `white_check_mark` | Confirmed/success |
| 🤖 | `robot` | Bot identity |
| 💬 | `speech_balloon` | Messaging |
| 🧠 | `brain` | AI/thinking |
| ⚡ | `zap` | Quick response |
| 📝 | `memo` | Taking notes |
| 🔍 | `mag` | Searching |

## Troubleshooting

### Reactions not appearing

1. **Check bot permissions:** Ensure your bot has write access to the channel in relay-chat admin panel
2. **Verify emoji format:** Use actual emoji characters or valid shortcodes
3. **Check logs:** Look for errors in `~/.openclaw/logs/openclaw.log`
4. **Test API endpoint:** The bot needs access to `POST /api/messages/{id}/reactions`

### Error: "bot not authorized for this channel"

Your bot doesn't have write permissions for the channel. In relay-chat admin:
1. Go to Bots section
2. Find your bot
3. Edit channel bindings
4. Ensure "Can Write" is enabled for the channel

### Reactions work but replies don't

Check that:
1. OpenClaw is running and configured correctly
2. The bot has both read AND write permissions
3. Your OpenClaw agent is properly set up
