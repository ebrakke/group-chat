#!/bin/bash
# Create a distributable release of the OpenClaw Relay Chat plugin

set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
FILENAME="openclaw-plugin-relaychat-v${VERSION}.zip"

echo "=== Creating Release v${VERSION} ==="
echo ""

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "Building plugin..."
    npm install
    npm run build
else
    echo "✓ dist/ directory exists"
fi

# Create the zip file
echo "📦 Creating $FILENAME..."
zip -r "$FILENAME" \
    dist/ \
    package.json \
    openclaw.plugin.json \
    install.sh \
    README.md \
    QUICKSTART.md \
    -q

SIZE=$(ls -lh "$FILENAME" | awk '{print $5}')

echo "✓ Created $FILENAME ($SIZE)"
echo ""

# Show what's included
echo "Contents:"
unzip -l "$FILENAME" | grep -E '(README|QUICKSTART|install\.sh|package\.json|openclaw\.plugin\.json|dist/index\.js)$'

echo ""
echo "=== Release Ready ==="
echo ""
echo "Distribution file: $FILENAME"
echo "Version: $VERSION"
echo "Size: $SIZE"
echo ""
echo "Next steps:"
echo "1. Test the installation on a clean system"
echo "2. Update DISTRIBUTION.md if needed"
echo "3. Share $FILENAME with users"
echo ""
echo "See DISTRIBUTION.md for distribution guidelines"
