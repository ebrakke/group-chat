# Cloudflare Access Fix - Production Login Issue

**Date**: Feb 11, 2026  
**Status**: ❌ BLOCKING PRODUCTION  
**Severity**: CRITICAL

## The Problem

Login is completely broken on production (`https://chat.brakke.cc`) with error:
```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

### Root Cause

Cloudflare Access intercepts **ALL** requests to `chat.brakke.cc`, including API calls:

```
Browser → Cloudflare Access (302 redirect) → ❌ NEVER REACHES API
```

**Request flow:**
1. Browser: `POST https://chat.brakke.cc/api/v1/auth/login`
2. Cloudflare Access: "No CF cookie? → 302 redirect to login page"
3. Browser follows redirect, receives HTML login page
4. JavaScript tries to parse HTML as JSON → **ERROR**

**Verification:**
```bash
$ curl -I https://chat.brakke.cc/api/v1/auth/login
HTTP/2 302 
location: https://brakke.cloudflareaccess.com/cdn-cgi/access/login/...
```

### Chicken-and-Egg Problem

- Users can't login to the app because the login API is protected by Cloudflare Access
- Users can't authenticate with Cloudflare Access to reach the login API
- **Result**: Login impossible

## Architecture History

### Before SvelteKit Proxy (Commit `af3cc59`)
```yaml
# docker-compose.prod.yml
environment:
  - PUBLIC_API_URL=https://chat.brakke.cc/api/v1
  - PUBLIC_WS_URL=wss://chat.brakke.cc/ws
```
- Frontend made direct requests to `https://chat.brakke.cc/api/v1/*`
- **This would have had the SAME Cloudflare Access problem**
- Either CF Access was added AFTER this setup, or there was a bypass rule

### After SvelteKit Proxy (Commit `2401d68`)
```yaml
# docker-compose.prod.yml
environment:
  - VITE_API_URL=
  - VITE_WS_URL=/ws
```
- Frontend makes relative requests: `/api/v1/auth/login`
- `hooks.server.ts` intercepts and proxies to `http://api:4000`
- **Works perfectly locally**
- **Broken in production due to Cloudflare Access**

### Current Request Chain (Production)

```
Browser
  ↓ POST /api/v1/auth/login
Cloudflare Access (BLOCKS HERE)
  ↓ 302 redirect to CF login
Cloudflare CDN
  ↓ (never reached)
Caddy Container (port 3000)
  ↓ reverse_proxy frontend:3000
SvelteKit Server
  ↓ hooks.server.ts intercepts /api/*
  ↓ proxy to http://api:4000
API Container (port 4000)
  ↓ Hono server
  ↓ Return JSON
```

**Problem**: Request never gets past Cloudflare Access

## Solutions

### ✅ Option 1: Cloudflare Access Bypass (RECOMMENDED)

**Action Required**: Erik configures Cloudflare Access to bypass `/api/*` paths

**Steps**:
1. Log into Cloudflare Dashboard
2. Go to **Zero Trust** → **Access** → **Applications**
3. Find the `chat.brakke.cc` application
4. Add a **Bypass Rule**:
   - **Path**: `/api/*`
   - **Action**: Bypass
   - **Decision**: Allow

**Result**: 
- API endpoints become publicly accessible (as they should be)
- Frontend remains protected by Cloudflare Access
- Login works because `/api/v1/auth/login` is accessible

**Pros**:
- ✅ No code changes required
- ✅ Maintains CF Access protection for frontend
- ✅ Works with current architecture
- ✅ Fast to implement (5 minutes)

**Cons**:
- ⚠️ API endpoints are now public (but this is normal for an API)
- ⚠️ Need to ensure API has proper authentication/rate limiting

### Option 2: Use `api.brakke.cc` Subdomain

**Action Required**: Configure separate subdomain for API, update frontend to use it

**Steps**:
1. Ensure `api.brakke.cc` points to the API container (port 4000)
2. Fix TLS certificate for `api.brakke.cc`
3. DO NOT put `api.brakke.cc` behind Cloudflare Access
4. Update frontend to use `https://api.brakke.cc`:
   ```yaml
   # docker-compose.prod.yml
   environment:
     - VITE_API_URL=https://api.brakke.cc
   ```
5. Remove `hooks.server.ts` proxy (no longer needed)
6. Update Caddyfile to route WebSocket directly

**Pros**:
- ✅ Clean separation of frontend and API
- ✅ Can apply different CF settings to each subdomain
- ✅ More flexible for future changes

**Cons**:
- ❌ Requires DNS/TLS configuration
- ❌ `api.brakke.cc` currently has TLS errors
- ❌ Requires code changes and redeployment
- ❌ More complex setup

### Option 3: Remove Cloudflare Access

**Action Required**: Disable CF Access for `chat.brakke.cc`

**Pros**:
- ✅ Login works immediately
- ✅ No configuration needed

**Cons**:
- ❌ Loses CF Access protection
- ❌ App must handle all authentication itself
- ❌ Probably not what Erik wants

## Recommended Fix

**I recommend Option 1**: Cloudflare Access bypass for `/api/*`

This is the fastest, simplest fix that:
1. Requires no code changes
2. Can be done in 5 minutes
3. Works with the current architecture
4. Maintains CF Access protection for the frontend

**After Erik adds the bypass rule**, login should work immediately.

## Verification

After the fix is applied, verify with:

```bash
# Should return 401 Unauthorized (not 302 redirect)
curl -I https://chat.brakke.cc/api/v1/auth/login

# Should return JSON error (not HTML)
curl -X POST https://chat.brakke.cc/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

Expected response:
```json
{"error":"Invalid credentials"}
```

NOT:
```html
<!DOCTYPE html>...
```

## Additional Notes

### Why the SvelteKit Proxy Can't Help

The proxy in `hooks.server.ts` works perfectly, but it only runs IF the request reaches the SvelteKit server. Cloudflare Access intercepts the request BEFORE it gets there.

### API Authentication

Once `/api/*` is publicly accessible, ensure the API has proper protection:
- ✅ Password authentication (bcrypt) - already implemented
- ✅ Session tokens with expiry - already implemented
- ✅ Rate limiting - NOT YET IMPLEMENTED (consider adding)
- ✅ CORS configuration - verify it's correct

### WebSocket Path

The `/ws` path also needs to be accessible for real-time messaging. Add it to the bypass rule:
- **Path**: `/api/*` OR `/ws`
- Or use: `/api/*` and `/ws` as separate rules

## Timeline

**Option 1 (recommended)**: 5-10 minutes
- 5 min: Erik configures CF Access bypass
- 2 min: Verify login works
- Done!

**Option 2**: 1-2 hours
- 30 min: Configure `api.brakke.cc` DNS/TLS
- 20 min: Update docker-compose and rebuild
- 10 min: Deploy and test
- Risk of additional issues

## Decision

**Waiting for**: Erik to add Cloudflare Access bypass rule for `/api/*` and `/ws`

Once that's done, production login will work immediately.
