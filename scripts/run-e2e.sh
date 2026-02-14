#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_PORT="${TEST_PORT:-8090}"
TMPDIR=$(mktemp -d)

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

echo "==> Building frontend..."
cd "$REPO_ROOT/frontend"
bun install --frozen-lockfile 2>/dev/null || bun install
bun run build

echo "==> Copying static assets..."
cp -r "$REPO_ROOT/frontend/dist/"* "$REPO_ROOT/cmd/app/static/"

echo "==> Building Go binary..."
cd "$REPO_ROOT"
go build -o "$TMPDIR/relay-chat" ./cmd/app/

echo "==> Starting server (port=$TEST_PORT, data=$TMPDIR)..."
DATA_DIR="$TMPDIR" PORT="$TEST_PORT" "$TMPDIR/relay-chat" &
SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$TEST_PORT/api/health" > /dev/null 2>&1; then
    echo "==> Server ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Server did not start in time"
    exit 1
  fi
  sleep 0.5
done

echo "==> Installing test dependencies..."
cd "$REPO_ROOT/tests/e2e"
bun install --frozen-lockfile 2>/dev/null || bun install
bunx playwright install chromium 2>/dev/null || true

echo "==> Running Playwright tests..."
TEST_PORT="$TEST_PORT" bunx playwright test
