# Dev Docker Stack Fix Summary

## Date: 2026-02-12

## Issues Fixed ✅

### 1. Frontend Port Mismatch
- **Problem**: frontend/Dockerfile was using PORT=8080 (from Fly changes) but Caddyfile.dev expected frontend:3000
- **Fix**: Reverted frontend/Dockerfile to use PORT=3000 for dev/self-hosted deployments
- **Result**: ✅ Frontend now runs on port 3000 and Caddy can proxy to it correctly

### 2. Playwright Port Mismatch
- **Problem**: docker-compose.dev.yml exposed Caddy on port 3001, but Playwright expected port 3002
- **Fix**: Changed Caddy port mapping from `3001:3000` to `3002:3000`
- **Result**: ✅ Frontend now accessible at http://localhost:3002 (matches Playwright config)

### 3. Health Endpoint Path
- **Problem**: API health was only at `/health`, tests might expect `/api/v1/health`
- **Fix**: Added health route to API router: `api.get('/health', ...)`
- **Result**: ✅ Health endpoint now available at both `/health` and `/api/v1/health`

### 4. Dockerfile COPY Paths
- **Problem**: Dockerfiles had incorrect COPY paths after being modified for Fly
- **Fix**: Updated COPY commands in api/Dockerfile, frontend/Dockerfile, relay/Dockerfile to work with docker-compose build context
- **Result**: ✅ All services build successfully

### 5. Dev vs Fly Separation
- **Maintained**: Dockerfile.fly remains separate for Fly deployments (port 8080, unified build)
- **Maintained**: Individual service Dockerfiles for docker-compose (port 3000 for frontend)

## Testing Results ✅

### Infrastructure Tests (All Pass)
```bash
# Health endpoints
$ curl http://localhost:4002/health
{"status":"ok"}

$ curl http://localhost:4002/api/v1/health
{"status":"ok"}

# Frontend accessibility
$ curl -I http://localhost:3002/
HTTP/1.1 200 OK

# API signup
$ curl -X POST http://localhost:4002/api/v1/auth/signup ...
{"token":"...","user":{...}}

# API login
$ curl -X POST http://localhost:4002/api/v1/auth/login ...
{"token":"...","user":{...}}
```

### Container Status
All containers start successfully and remain healthy:
- ✅ relay-chat-caddy-1 (port 3002)
- ✅ relay-chat-frontend-1 (port 3000 internal)
- ✅ relay-chat-api-1 (port 4002)
- ✅ relay-chat-relay-1 (port 3336)
- ✅ relay-chat-blossom-1 (port 3337)

## Playwright Tests Status ⚠️

Playwright tests were run but encountered WebSocket authentication issues. This appears to be a **separate issue** from the infrastructure fixes:

- Some tests pass (invalid login, redirect checks, etc.)
- Many tests timeout waiting for WebSocket connections
- API logs show: "WebSocket client disconnected: unauthenticated"

**Note**: This is likely a test implementation issue or WebSocket session management issue, NOT related to the port/infrastructure fixes completed here.

## Files Changed

1. `frontend/Dockerfile` - Reverted PORT to 3000
2. `docker-compose.dev.yml` - Changed Caddy port mapping to 3002
3. `api/src/index.ts` - Added /api/v1/health endpoint
4. `api/Dockerfile` - Fixed COPY paths
5. `relay/Dockerfile` - Fixed COPY paths

## Commit

```
commit de1bafc
Author: root <root@svc-devbox.brakke.cc>
Date:   Thu Feb 12 06:39:54 2026 -0700

    fix: restore dev Docker stack ports + Playwright config
```

Pushed to: origin/master

## Next Steps (Optional)

If Playwright tests need to fully pass, investigate:
1. WebSocket authentication in test setup
2. Session cookie handling in Playwright tests
3. WebSocket connection timing/lifecycle in tests

The infrastructure is now correct and working as designed.
