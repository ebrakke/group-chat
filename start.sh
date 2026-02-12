#!/bin/sh
set -e

# Cleanup function for graceful shutdown
cleanup() {
  echo "Shutting down services..."
  kill -TERM $CADDY_PID $API_PID $FRONTEND_PID 2>/dev/null || true
  wait $CADDY_PID $API_PID $FRONTEND_PID 2>/dev/null || true
  echo "Services stopped."
  exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

echo "Starting Relay Chat unified service..."

# Start API
echo "Starting API on port 4000..."
cd /app/api
PORT=4000 node dist/index.js &
API_PID=$!

# Start Frontend
echo "Starting Frontend on port 3000..."
cd /app/frontend
PORT=3000 node build &
FRONTEND_PID=$!

# Give services a moment to start
sleep 2

# Start Caddy (reverse proxy on port 8080)
echo "Starting Caddy on port 8080..."
caddy run --config /etc/caddy/Caddyfile &
CADDY_PID=$!

echo "All services started:"
echo "  - Caddy (port 8080) PID: $CADDY_PID"
echo "  - API (port 4000) PID: $API_PID"
echo "  - Frontend (port 3000) PID: $FRONTEND_PID"

# Wait for all processes
wait $CADDY_PID $API_PID $FRONTEND_PID
