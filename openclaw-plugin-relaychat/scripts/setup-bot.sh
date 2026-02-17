#!/bin/bash
set -e

echo "🤖 Relay Chat OpenClaw Bot Setup"
echo "=================================="
echo ""

# Prompt for bot details
read -p "Bot username (e.g., claude-bot): " BOT_USERNAME
read -p "Bot display name (e.g., Claude): " BOT_DISPLAY_NAME
read -p "Relay-chat URL (default: http://localhost:8080): " RELAY_URL
RELAY_URL=${RELAY_URL:-http://localhost:8080}

echo ""
echo "📋 Next steps:"
echo "1. Open your relay-chat admin panel: ${RELAY_URL}"
echo "2. Navigate to the 'Bots' section"
echo "3. Create a new bot:"
echo "   - Username: ${BOT_USERNAME}"
echo "   - Display Name: ${BOT_DISPLAY_NAME}"
echo "4. Generate a token for the bot"
echo "5. Bind the bot to desired channels with read+write permissions"
echo ""

read -p "Press Enter once you've completed these steps and have the token..."

echo ""
read -sp "Paste the bot token: " BOT_TOKEN
echo ""

# Generate OpenClaw config snippet
CONFIG_FILE="/tmp/openclaw-relaychat-config-$$.json"
cat > "$CONFIG_FILE" <<EOF
{
  "channels": {
    "relaychat": {
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://${RELAY_URL#http://}/ws",
          "apiBase": "${RELAY_URL}",
          "token": "${BOT_TOKEN}",
          "username": "${BOT_USERNAME}"
        }
      }
    }
  }
}
EOF

echo ""
echo "✓ Setup complete!"
echo ""
echo "Add this to your OpenClaw config (~/.config/openclaw/config.json):"
echo ""
cat "$CONFIG_FILE"
echo ""
echo "Configuration saved to: $CONFIG_FILE"
echo ""
echo "Then install the plugin:"
echo "  openclaw plugins install openclaw-plugin-relaychat"
echo ""
echo "Restart OpenClaw and you're ready!"
echo ""

rm -f "$CONFIG_FILE"
