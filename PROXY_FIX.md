# API Proxy Fix - Feb 11, 2025

## Problem

The production deployment at `chat.brakke.cc` had login broken because:

1. Frontend API calls went to `https://chat.brakke.cc/api/v1/...` 
2. That URL routed to the frontend container (port 3001), not API (port 4000)
3. API requests got back HTML instead of JSON
4. Environment variables used wrong names (`PUBLIC_API_URL` vs `VITE_API_URL`)

## Solution

Implemented **SvelteKit server-side API proxy** to route requests properly:

### Changes Made

1. **Created `frontend/src/hooks.server.ts`**
   - Intercepts all `/api/*` requests on the SvelteKit server
   - Proxies them to `http://api:4000` (internal Docker network)
   - Frontend now makes relative requests like `/api/v1/auth/login`

2. **Updated `frontend/src/lib/api.ts`**
   - Changed `API_URL` default from `http://localhost:4000` to empty string
   - All fetch calls now use relative URLs (e.g., `/api/v1/channels`)

3. **Updated `frontend/src/lib/websocket.ts`**
   - WebSocket URL now derived from `window.location` (browser-side)
   - Uses `wss://` for HTTPS, `ws://` for HTTP
   - Path is always `/ws` (relative to current host)

4. **Updated `docker-compose.prod.yml` and `docker-compose.dev.yml`**
   - Fixed env var names: `PUBLIC_API_URL` → `VITE_API_URL`
   - Set `VITE_API_URL=` (empty, use relative URLs)
   - Set `VITE_WS_URL=/ws` (relative WebSocket path)

5. **Added reverse proxy examples**
   - `Caddyfile.example` - Caddy configuration
   - `nginx.conf.example` - Nginx configuration
   - Both handle WebSocket upgrade on `/ws` path to API server

### Reverse Proxy Configuration Required

The reverse proxy (nginx/caddy/etc.) fronting the app **must**:

1. Route `/ws` WebSocket upgrades directly to API server (port 4000)
2. Route all other requests to frontend SvelteKit server (port 3000)
3. Frontend's server hook will proxy `/api/*` requests internally

See `Caddyfile.example` or `nginx.conf.example` for reference.

## Testing

After deploying:

1. Check API requests: Network tab should show `/api/v1/...` requests returning JSON
2. Check WebSocket: Should connect to `wss://chat.brakke.cc/ws`
3. Try login: Should now work correctly

## Deployment

```bash
# Build and restart containers
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f frontend
```

Make sure your reverse proxy (caddy/nginx) is configured to handle `/ws` upgrades!
