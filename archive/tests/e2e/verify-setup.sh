#!/bin/bash
# Quick verification script for e2e test framework

set -e

echo "🔍 Verifying Relay Chat E2E Test Framework Setup"
echo "================================================"
echo ""

# Check we're in the right directory
if [ ! -f "playwright.config.ts" ]; then
    echo "❌ Error: Must be run from tests/e2e directory"
    exit 1
fi

echo "✅ In correct directory"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm found: $(npm --version)"

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo "⚠️  Dependencies not installed, running npm install..."
    npm install
fi
echo "✅ Dependencies installed"

# Check if Playwright is installed
if [ ! -d "node_modules/@playwright" ]; then
    echo "❌ Playwright not found in node_modules"
    exit 1
fi
echo "✅ Playwright installed"

# Check dev environment
echo ""
echo "🌐 Checking dev environment..."

FRONTEND_UP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 || echo "000")
API_UP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/v1/health || echo "000")

if [ "$FRONTEND_UP" = "200" ]; then
    echo "✅ Frontend is running (http://localhost:3002)"
else
    echo "⚠️  Frontend not responding (expected 200, got $FRONTEND_UP)"
    echo "   Run: docker compose -f ../../docker-compose.dev.yml up -d"
fi

if [ "$API_UP" = "200" ]; then
    echo "✅ API routes are responding (http://localhost:3002/api/v1/health)"
else
    echo "⚠️  API routes not responding (expected 200, got $API_UP)"
    echo "   Run: docker compose -f ../../docker-compose.dev.yml up -d --build"
fi

# Check file structure
echo ""
echo "📁 Checking file structure..."

REQUIRED_FILES=(
    "fixtures/index.ts"
    "pages/ChatPage.ts"
    "pages/ThreadPanel.ts"
    "pages/ChannelModal.ts"
    "pages/LoginPage.ts"
    "pages/SignupPage.ts"
    "pages/AdminPage.ts"
    "tests/auth.spec.ts"
    "tests/messaging.spec.ts"
    "tests/threads.spec.ts"
    "tests/reactions.spec.ts"
    "tests/channels.spec.ts"
    "tests/realtime.spec.ts"
    "tests/file-uploads.spec.ts"
    "playwright.config.ts"
    "package.json"
    "README.md"
    "TEST_GUIDE.md"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ Missing: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
done

if [ $MISSING_FILES -gt 0 ]; then
    echo ""
    echo "❌ $MISSING_FILES files missing"
    exit 1
fi

# Summary
echo ""
echo "================================================"
echo "🎉 Framework setup verified!"
echo ""
echo "Next steps:"
echo "  1. Ensure dev environment is running:"
echo "     docker compose -f ../../docker-compose.dev.yml up -d"
echo ""
echo "  2. Install Playwright browsers (if not done):"
echo "     npx playwright install chromium"
echo ""
echo "  3. Run tests:"
echo "     npm test                  # All tests"
echo "     npm run test:ui           # Interactive mode"
echo "     npm test -- tests/auth.spec.ts  # Single file"
echo ""
echo "📖 See README.md and TEST_GUIDE.md for more info"
echo "================================================"
