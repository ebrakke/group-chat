# Development Principles - Lessons Learned

**Created**: Feb 11, 2026  
**Context**: Documenting lessons from production bugs to prevent future issues

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Request Chain Awareness](#request-chain-awareness)
3. [Testing](#testing)
4. [DRY Principle](#dry-principle)
5. [Deployment](#deployment)
6. [Cloudflare Access & Proxies](#cloudflare-access--proxies)
7. [SvelteKit Best Practices](#sveltekit-best-practices)

---

## Environment Variables

### Build-Time vs Runtime

**Understanding the difference is CRITICAL for SvelteKit apps.**

#### Build-Time Variables (Vite)

**Prefix**: `VITE_*`  
**When**: Embedded into JavaScript during `npm run build`  
**Where**: Frontend code (`import.meta.env.VITE_*`)

```javascript
// ❌ WRONG: Build-time variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Problem: If VITE_API_URL='http://api:4000' during build,
// that value is HARDCODED into the bundled JS file
// Changing it later requires rebuilding!
```

```javascript
// ✅ RIGHT: Runtime detection
const API_URL = import.meta.env.VITE_API_URL || '';
// Empty string means use relative URLs (e.g., /api/v1/auth/login)
// Browser resolves relative to current window.location.origin
```

**Key Points**:
- ✅ Vite variables are replaced at build time (like macros)
- ✅ Values are visible in the bundled JavaScript (check browser DevTools)
- ❌ Cannot be changed after build without rebuilding
- ❌ Should NOT contain secrets (embedded in public JS)

#### Runtime Variables (Server-Side)

**No prefix** (or `PUBLIC_*` in SvelteKit)  
**When**: Read when the server starts  
**Where**: Server-side code only (`hooks.server.ts`, API server, etc.)

```typescript
// ✅ RIGHT: Server-side runtime variable
// hooks.server.ts
const API_CONTAINER_URL = process.env.API_URL || 'http://api:4000';
```

**Key Points**:
- ✅ Read from environment when server starts
- ✅ Can be changed by restarting container (no rebuild needed)
- ✅ Never exposed to browser
- ✅ Safe for secrets

### Docker ARG vs ENV

```dockerfile
# Dockerfile

# ARG: Only available during BUILD
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

# Build command: npm run build
# Vite reads VITE_API_URL from environment during build
```

```yaml
# docker-compose.yml

services:
  frontend:
    build:
      args:
        VITE_API_URL: https://api.example.com  # Build-time
    environment:
      API_URL: http://api:4000                 # Runtime
```

**Flow**:
1. `docker compose build`: Passes ARG to Dockerfile
2. Dockerfile: Sets ENV from ARG, runs `npm run build`
3. Vite: Reads `VITE_*` from ENV, embeds into bundled JS
4. `docker compose up`: Sets ENV (runtime variables)
5. Server: Reads ENV when starting

### Never Hardcode URLs

```javascript
// ❌ BAD: Hardcoded URL
const response = await fetch('http://localhost:4000/api/v1/channels');

// ❌ BAD: Hardcoded in every file
const API_URL = 'http://localhost:4000';

// ✅ GOOD: Relative URL (works in any environment)
const response = await fetch('/api/v1/channels');

// ✅ GOOD: Centralized configuration
// src/lib/config.ts
export const API_URL = import.meta.env.VITE_API_URL || '';

// src/lib/api.ts
import { API_URL } from './config';
```

### Environment Variable Checklist

When adding a new environment variable:

- [ ] Does it need to be in the browser? → Use `VITE_*` prefix
- [ ] Is it a secret? → Keep server-side only (no `VITE_*`)
- [ ] Is it a URL? → Use relative URLs if possible
- [ ] Does it change per environment? → Document in `.env.example`
- [ ] Is it build-time or runtime? → Choose ARG/ENV appropriately
- [ ] Have you tested with the actual value? → Don't assume defaults work

---

## Request Chain Awareness

### Production Request Path

**You MUST understand the ENTIRE chain** from browser to backend:

```
Browser
  ↓ https://chat.brakke.cc/api/v1/auth/login
Cloudflare DNS (DNS resolution)
  ↓ Resolves to origin server IP
Cloudflare CDN (Edge server)
  ↓ Caches static assets, proxies dynamic requests
Cloudflare Access (Zero Trust security)
  ↓ Checks authentication, may return 302 redirect
Origin Server (svc-docker:3000)
  ↓ Receives request (HTTP/1.1 or HTTP/2)
Caddy Reverse Proxy (:3000 → frontend:3000)
  ↓ Routes /ws to api:4000, everything else to frontend:3000
SvelteKit Server (frontend:3000)
  ↓ handles hooks.server.ts
hooks.server.ts (Server-side proxy)
  ↓ Intercepts /api/* requests
  ↓ Proxies to http://api:4000
API Server (api:4000)
  ↓ Hono framework
  ↓ Process request, query database
  ↓ Return JSON response
```

### Where Things Can Break

Each layer can cause failures:

| Layer | Failure Mode | Symptoms | How to Debug |
|-------|--------------|----------|--------------|
| **Browser** | CORS policy, fetch errors | Console errors, network tab shows failed request | Check browser DevTools |
| **Cloudflare DNS** | Wrong IP | Timeout, connection refused | `dig chat.brakke.cc` |
| **Cloudflare CDN** | Cache issues | Stale content, wrong responses | Purge cache, check CF dashboard |
| **Cloudflare Access** | Blocks request | 302 redirect, HTML instead of JSON | `curl -I` to check redirect |
| **Origin Server** | Port not exposed | Connection refused | `docker ps`, check port mappings |
| **Caddy** | Wrong routing | 404, requests go to wrong container | Check Caddyfile, `docker logs caddy` |
| **SvelteKit** | Proxy misconfigured | Request not intercepted | Check hooks.server.ts logs |
| **API Server** | Server error | 500, JSON error response | `docker logs api` |

### Testing Each Layer

```bash
# 1. Test API directly (bypasses everything)
docker exec -it relay-chat-api-1 curl http://localhost:4000/api/v1/channels

# 2. Test from frontend container (tests internal proxy)
docker exec -it relay-chat-frontend-1 curl http://api:4000/api/v1/channels

# 3. Test from Caddy container (tests Caddy routing)
docker exec -it relay-chat-caddy-1 curl http://frontend:3000/api/v1/channels

# 4. Test from host (tests Docker networking)
curl http://localhost:3000/api/v1/channels

# 5. Test through Cloudflare (tests full chain)
curl https://chat.brakke.cc/api/v1/channels
```

**Rule**: Test at EACH layer to isolate where failures occur.

---

## Testing

### Why Localhost Testing Is Insufficient

**Localhost skips critical production components:**

```
Local Development:
Browser → SvelteKit Dev Server (:5173) → API (:4000)

Production:
Browser → CF Access → CF CDN → Caddy → SvelteKit (:3000) → API (:4000)
```

**What you miss by only testing locally:**

- ❌ Cloudflare Access authentication
- ❌ Cloudflare CDN caching behavior
- ❌ Reverse proxy routing (Caddy/Nginx)
- ❌ Docker networking issues
- ❌ Environment variable resolution in containers
- ❌ Build artifacts (local uses dev server, prod uses built files)
- ❌ HTTPS/TLS certificate issues
- ❌ CORS with actual production origins

### The "Works on My Machine" Problem

```javascript
// This works locally:
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
await fetch(`${API_URL}/api/v1/channels`);

// But fails in production because:
// 1. localhost:4000 not accessible from browser
// 2. API_URL might be empty or wrong in production
// 3. Cloudflare Access might block the request
```

### Proper Testing Procedure

#### 1. **Local Development** (`npm run dev`)
- Fast iteration
- Basic functionality testing
- No authentication layers

#### 2. **Local Docker** (`docker-compose up`)
- Test container networking
- Verify environment variables
- Check Docker port mappings

```bash
# Build fresh
docker-compose down -v
docker-compose up --build

# Test from host
curl http://localhost:3000/api/v1/channels
```

#### 3. **Production-Like Environment**
- Use `docker-compose.prod.yml`
- Test with real domain (or edit /etc/hosts)
- Include reverse proxy (Caddy)

```bash
# Use production config
docker-compose -f docker-compose.prod.yml up --build

# Test with production-like requests
curl http://localhost:3000/api/v1/channels
```

#### 4. **Staging/Production**
- Test through actual Cloudflare
- Verify Cloudflare Access rules
- Check real TLS certificates

```bash
# Test actual production URL
curl https://chat.brakke.cc/api/v1/channels

# Check for redirects
curl -I https://chat.brakke.cc/api/v1/auth/login
```

### Testing Checklist

Before deploying to production:

- [ ] Test API directly in container (`docker exec`)
- [ ] Test through Caddy proxy (`curl localhost:3000`)
- [ ] Test through Cloudflare (`curl https://...`)
- [ ] Test WebSocket connection (not just HTTP)
- [ ] Test with browser DevTools (check Network tab)
- [ ] Test authentication flow end-to-end
- [ ] Check for CORS errors in browser console
- [ ] Verify environment variables in running containers (`docker exec env`)
- [ ] Check Docker logs for all containers (`docker-compose logs`)

**Golden Rule**: **If you haven't tested it through the production request chain, you haven't tested it.**

---

## DRY Principle

### Don't Repeat Yourself

**Bad**: API_URL duplicated in every page

```javascript
// src/routes/login/+page.svelte
const API_URL = import.meta.env.VITE_API_URL || '';
await fetch(`${API_URL}/api/v1/auth/login`, {...});

// src/routes/channels/+page.svelte
const API_URL = import.meta.env.VITE_API_URL || '';
await fetch(`${API_URL}/api/v1/channels`, {...});

// src/routes/admin/+page.svelte
const API_URL = import.meta.env.VITE_API_URL || '';
await fetch(`${API_URL}/api/v1/invites`, {...});
```

**Problems**:
- 🐛 Easy to forget to update one file
- 🐛 Inconsistent defaults across pages
- 🐛 Hard to change behavior globally
- 🐛 Increases bundle size (repeated code)

**Good**: Centralized API module

```javascript
// src/lib/config.ts
export const API_URL = import.meta.env.VITE_API_URL || '';

// src/lib/api.ts
import { API_URL } from './config';

export async function apiRequest(path: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

export async function login(username: string, password: string) {
  return apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchChannels() {
  return apiRequest('/api/v1/channels');
}
```

```javascript
// src/routes/login/+page.svelte
import { login } from '$lib/api';

async function handleLogin() {
  const user = await login(username, password);
  // ...
}
```

**Benefits**:
- ✅ Single source of truth
- ✅ Easier to test (mock the API module)
- ✅ Consistent error handling
- ✅ Easier to add authentication headers globally
- ✅ Smaller bundle size (shared code)

### What to Centralize

- ✅ API URL configuration
- ✅ API request functions
- ✅ Authentication headers
- ✅ Error handling
- ✅ WebSocket connection logic
- ✅ Type definitions (User, Channel, Message, etc.)

---

## Deployment

### Why --no-cache Matters

**Docker build cache can hide bugs:**

```bash
# ❌ BAD: Uses cached layers
docker-compose build

# Might use old:
# - npm dependencies
# - environment variable values
# - source code (if COPY layer is cached)
```

```bash
# ✅ GOOD: Force fresh build
docker-compose build --no-cache

# Ensures:
# - Latest npm packages installed
# - Current environment variables used
# - All source code rebuilt
```

**When to use `--no-cache`**:
- 🔧 Debugging mysterious build issues
- 🔧 After changing Dockerfile or docker-compose.yml
- 🔧 After changing environment variables
- 🔧 Before production deployment
- 🔧 When dependencies might have updated

**When cache is OK**:
- ✅ Local development iterations
- ✅ Testing small code changes
- ✅ CI/CD builds (use cache for speed, but test fresh builds too)

### Verifying Built JavaScript

**Build-time variables are embedded in JS. Verify them:**

```bash
# Build the frontend
docker-compose build --no-cache frontend

# Extract the built files
docker create --name temp-frontend relay-chat-frontend
docker cp temp-frontend:/app/build ./inspect-build
docker rm temp-frontend

# Search for hardcoded URLs
grep -r "localhost:4000" ./inspect-build
grep -r "API_URL" ./inspect-build

# Check what actually got embedded
cat ./inspect-build/_app/immutable/chunks/*.js | grep -o 'http[s]*://[^"]*'
```

**If you find hardcoded URLs you didn't expect**:
1. Check `VITE_*` environment variables during build
2. Verify Dockerfile ARGs are set correctly
3. Check that code uses `import.meta.env.VITE_*` not hardcoded strings
4. Rebuild with `--no-cache`

### Deployment Checklist

- [ ] Run `docker-compose build --no-cache`
- [ ] Check environment variables are correct
- [ ] Verify `docker-compose.prod.yml` has production secrets
- [ ] Test locally with `docker-compose up` before deploying
- [ ] Check Docker logs for startup errors
- [ ] Verify all containers are running (`docker ps`)
- [ ] Test health endpoints (`curl http://localhost:...`)
- [ ] Test through reverse proxy (`curl https://...`)
- [ ] Check browser console for errors
- [ ] Verify WebSocket connection
- [ ] Test full user flow (signup → login → send message)

---

## Cloudflare Access & Proxies

### How Cloudflare Access Works

Cloudflare Access is a **Zero Trust security layer** that sits between the internet and your application.

**Request Flow**:
```
1. Browser → https://chat.brakke.cc/any-path
2. Cloudflare Access checks for CF_Authorization cookie
3. If cookie valid → Allow request to origin
4. If cookie invalid/missing → Return 302 redirect to CF Access login
5. User authenticates (email, Google, etc.)
6. CF Access sets cookie → Redirect back to original URL
```

### The Chicken-and-Egg Problem

```
User wants to login to app
  ↓
Browser calls /api/v1/auth/login
  ↓
Cloudflare Access: "No cookie? Redirect to CF login"
  ↓
Browser follows redirect, gets HTML login page
  ↓
JavaScript expects JSON, gets HTML
  ↓
ERROR: Unexpected token '<'
```

**The API can't authenticate users if it's behind authentication!**

### Solution: Bypass Rules

Configure Cloudflare Access to **bypass** certain paths:

```
Application: chat.brakke.cc
Policy:
  - Path: /api/*        → Action: Bypass (Allow without auth)
  - Path: /ws           → Action: Bypass (WebSocket)
  - Path: /*            → Action: Require CF Access authentication
```

**This allows**:
- ✅ API is publicly accessible (handles its own auth)
- ✅ Frontend requires Cloudflare Access login
- ✅ Users can login to the app without CF cookie

### Cookie Flow

```
# Without bypass:
1. Browser → /login page → CF Access (no cookie) → Redirect → CF login
2. User authenticates with CF → CF sets cookie → Redirect back
3. Browser → /login page → CF Access (has cookie) → Allow → Frontend loads
4. Frontend → /api/v1/auth/login → CF Access (has cookie) → Allow → API
   (But API sees CF cookie, not app session!)

# With bypass:
1. Browser → /login page → CF Access (no cookie) → Redirect → CF login
2. User authenticates with CF → CF sets cookie → Redirect back
3. Browser → /login page → CF Access (has cookie) → Allow → Frontend loads
4. Frontend → /api/v1/auth/login → CF Access → BYPASS → API
   (API handles its own authentication, returns session token)
5. Frontend stores session token
6. Future API calls include session token (API validates it)
```

### When to Use CF Access

**Good use cases**:
- ✅ Internal tools (limit to company email domain)
- ✅ Admin panels
- ✅ Staging environments
- ✅ Protecting static content

**Not suitable for**:
- ❌ Public APIs (unless you bypass them)
- ❌ Mobile apps (can't easily get CF cookies)
- ❌ Third-party integrations
- ❌ Public-facing apps (users need their own accounts)

### Reverse Proxy Configuration

**Caddy must handle WebSocket upgrades:**

```caddyfile
# ❌ BAD: WebSocket requests fail
:3000 {
    reverse_proxy frontend:3000
}

# ✅ GOOD: WebSocket upgrade headers handled
:3000 {
    @websocket {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket api:4000
    
    reverse_proxy frontend:3000
}
```

**Why**: 
- WebSocket requires HTTP/1.1 Upgrade
- Caddy needs explicit config to proxy upgrade headers
- Without it, WebSocket falls back to polling or fails

---

## SvelteKit Best Practices

### API Proxying Behind Reverse Proxies

SvelteKit can act as a proxy using `hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

const API_CONTAINER_URL = process.env.API_URL || 'http://api:4000';

export const handle: Handle = async ({ event, resolve }) => {
  // Intercept /api/* requests
  if (event.url.pathname.startsWith('/api/')) {
    const apiUrl = `${API_CONTAINER_URL}${event.url.pathname}${event.url.search}`;
    
    return fetch(apiUrl, {
      method: event.request.method,
      headers: event.request.headers,
      body: event.request.body,
      // @ts-ignore
      duplex: 'half',
    });
  }
  
  // Pass through to SvelteKit
  return resolve(event);
};
```

**When to use this**:
- ✅ Production behind a reverse proxy
- ✅ Avoid CORS issues (same origin for frontend and API)
- ✅ Hide internal container names from browser

**When NOT to use**:
- ❌ WebSocket connections (proxy at Caddy/Nginx level instead)
- ❌ Large file uploads (overhead of double proxying)
- ❌ If you need to bypass authentication layers (doesn't help with CF Access)

### Environment Variable Handling

```javascript
// ✅ GOOD: Use relative URLs
const API_URL = import.meta.env.VITE_API_URL || '';
await fetch(`${API_URL}/api/v1/channels`);
// With API_URL='', this becomes: fetch('/api/v1/channels')
// Browser resolves relative to window.location.origin

// ❌ BAD: Hardcoded development URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
// If VITE_API_URL is empty/undefined, uses localhost (fails in production)
```

```typescript
// ✅ GOOD: Runtime resolution
// src/lib/websocket.ts
function getWebSocketURL() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsPath = import.meta.env.VITE_WS_URL || '/ws';
  return `${protocol}//${window.location.host}${wsPath}`;
}

// ❌ BAD: Build-time hardcoding
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';
```

### Deployment Behind CDNs/Access Proxies

**Key principles**:

1. **Use relative URLs** wherever possible
2. **Derive URLs from `window.location`** for client-side connections
3. **Server-side proxy** for API calls (avoids CORS, works with CDNs)
4. **Bypass authentication layers** for public endpoints (login, signup)
5. **Test through the actual production chain** (CDN, CF Access, etc.)

**Checklist for SvelteKit behind Cloudflare**:

- [ ] `VITE_API_URL=''` (empty, use relative URLs)
- [ ] `hooks.server.ts` proxies `/api/*` to internal API container
- [ ] Cloudflare Access bypasses `/api/*` (or API has own subdomain)
- [ ] WebSocket upgrade handled by Caddy/Nginx (not SvelteKit)
- [ ] CORS headers not needed (same-origin requests)
- [ ] Test with `curl https://your-domain.com` (not localhost)

---

## Summary

### The One-Page Version

1. **Environment Variables**
   - `VITE_*` = build-time (embedded in JS)
   - Regular env vars = runtime (server-side only)
   - Use relative URLs (`''`) not absolute URLs
   - Never hardcode `localhost`

2. **Request Chain**
   - Understand every layer from browser to API
   - Test at each layer to isolate failures
   - Don't assume localhost = production

3. **Testing**
   - Local dev is not enough
   - Test through Docker locally
   - Test through actual Cloudflare/CDN before claiming "done"

4. **DRY**
   - One `API_URL` config, not one per file
   - Centralize API functions in `src/lib/api.ts`
   - Share types, error handling, auth headers

5. **Deployment**
   - Use `--no-cache` for production builds
   - Verify what's in the built JavaScript
   - Test locally before pushing to production

6. **Cloudflare Access**
   - Bypass `/api/*` for public APIs
   - Bypass `/ws` for WebSocket
   - Understand cookie flow
   - Don't put authentication endpoints behind authentication!

7. **SvelteKit**
   - Use `hooks.server.ts` for API proxying
   - Derive URLs at runtime, not build-time
   - Handle WebSocket upgrades at Caddy/Nginx level
   - Test through the full production stack

---

**Remember**: Localhost is a lie. Always test in production-like conditions. 🚀
