#!/bin/bash
# Quick installation script for OpenClaw Relay Chat Plugin

set -e

echo "=== OpenClaw Relay Chat Plugin Installer ==="
echo ""

# Check if OpenClaw is installed
if ! command -v openclaw &> /dev/null; then
    echo "❌ Error: OpenClaw not found. Please install OpenClaw first."
    exit 1
fi

# Detect OpenClaw config directory
if [ -d "$HOME/.openclaw" ]; then
    OPENCLAW_DIR="$HOME/.openclaw"
elif [ -d "$HOME/.config/openclaw" ]; then
    OPENCLAW_DIR="$HOME/.config/openclaw"
else
    echo "❌ Error: OpenClaw directory not found."
    echo "Expected: ~/.openclaw or ~/.config/openclaw"
    exit 1
fi

echo "✓ Found OpenClaw directory: $OPENCLAW_DIR"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "⚠️  dist/ directory not found. Building plugin..."
    if ! command -v npm &> /dev/null; then
        echo "❌ Error: npm not found. Please install Node.js and npm."
        exit 1
    fi
    npm install
    npm run build
fi

echo "✓ Plugin built successfully"

# Create extensions directory
PLUGIN_DIR="$OPENCLAW_DIR/extensions/openclaw-plugin-relaychat"
mkdir -p "$PLUGIN_DIR"

# Copy plugin files
echo "📦 Installing plugin to $PLUGIN_DIR..."
cp -r dist package.json openclaw.plugin.json "$PLUGIN_DIR/"

# Install dependencies in the plugin directory
echo "📦 Installing plugin dependencies..."
cd "$PLUGIN_DIR"
npm install --production --no-save 2>&1 | grep -v "^npm WARN"

echo "✓ Plugin files copied and dependencies installed"
echo ""

# Check if openclaw.json exists
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️  Configuration file not found: $CONFIG_FILE"
    echo "Creating default configuration..."
    cat > "$CONFIG_FILE" <<'EOF'
{
  "channels": {
    "relaychat": {
      "accounts": {}
    }
  }
}
EOF
fi

echo "=== Installation Complete! ==="
echo ""
echo "Next steps:"
echo "1. Get a bot token from your relay-chat admin panel"
echo "2. Edit $CONFIG_FILE and add:"
echo ""
cat <<'EOF'
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
EOF
echo ""
echo "3. Restart OpenClaw:"
echo "   systemctl restart openclaw   # or manually restart"
echo ""
echo "4. Verify installation:"
echo "   openclaw status"
echo "   tail -f $OPENCLAW_DIR/logs/openclaw.log"
echo ""
echo "📖 See README.md for detailed configuration options"
