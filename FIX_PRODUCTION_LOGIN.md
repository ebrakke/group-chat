# 🚨 URGENT: Fix Production Login - Action Required

**Date**: Feb 11, 2026  
**Status**: ❌ Production login completely broken  
**Time to fix**: 5 minutes

---

## The Problem

Login fails at `https://chat.brakke.cc` with error:
```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**Root cause**: Cloudflare Access intercepts ALL requests (including API calls) and returns HTML login page instead of JSON.

**Test it yourself**:
```bash
$ curl -I https://chat.brakke.cc/api/v1/auth/login
HTTP/2 302
location: https://brakke.cloudflareaccess.com/cdn-cgi/access/login/...
```

## The Fix (5 minutes)

**You need to add a Cloudflare Access bypass rule for API paths.**

### Step-by-Step Instructions

1. **Log into Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Select your account
   - Go to **Zero Trust** → **Access** → **Applications**

2. **Find the chat.brakke.cc application**
   - Click on the application
   - Go to **Policies** or **Rules**

3. **Add Bypass Rules**

   **Option A: Add as new policy** (if no bypass exists)
   - Click "Add a policy"
   - Policy name: `API Bypass`
   - Action: **Bypass**
   - Configure the rule:
     - **Path**: `/api/*`
   - Click "Save"
   
   **Then add WebSocket bypass:**
   - Click "Add a policy"
   - Policy name: `WebSocket Bypass`
   - Action: **Bypass**
   - Configure the rule:
     - **Path**: `/ws`
   - Click "Save"

   **Option B: Edit existing policy**
   - Find the existing bypass or allow policy
   - Add path rules:
     - Path: `/api/*` → Bypass
     - Path: `/ws` → Bypass

4. **Verify the fix**

   ```bash
   # Should return 401 (not 302 redirect)
   curl -I https://chat.brakke.cc/api/v1/auth/login
   
   # Should return JSON error (not HTML)
   curl -X POST https://chat.brakke.cc/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"test"}'
   ```
   
   Expected output:
   ```json
   {"error":"Invalid credentials"}
   ```

5. **Test in browser**
   - Go to https://chat.brakke.cc
   - Should redirect to CF Access login (normal)
   - After authenticating with CF, should see app
   - Try to login → Should work now!

---

## Why This Happened

The current architecture:

```
Browser → Cloudflare Access (BLOCKS HERE) → CDN → Caddy → SvelteKit → API
```

Cloudflare Access was blocking `/api/*` requests, causing:
1. Browser calls `/api/v1/auth/login`
2. CF Access: "No cookie? → 302 redirect to CF login page"
3. Browser gets HTML instead of JSON
4. JavaScript fails to parse HTML as JSON

**With the bypass**:
```
Browser → Cloudflare Access (BYPASSES /api/*) → CDN → Caddy → SvelteKit → API
```

Now API requests work, and the API handles its own authentication.

---

## Security Notes

**This is safe because**:
- ✅ The API has its own authentication (bcrypt passwords, session tokens)
- ✅ This is how most web apps work (public API, authenticated frontend)
- ✅ Frontend still protected by Cloudflare Access
- ✅ API endpoints require login (except `/auth/login` and `/auth/signup`)

**Consider adding** (future improvement):
- Rate limiting on API endpoints
- CAPTCHA on login endpoint
- IP-based rate limiting in Cloudflare

---

## Documentation

I've created two comprehensive guides:

1. **CLOUDFLARE_ACCESS_FIX.md** - Full analysis of the issue
2. **DEVELOPMENT_PRINCIPLES.md** - Lessons learned to prevent future bugs

Both committed and pushed to the repo.

---

## Alternative Solutions

If you don't want to bypass `/api/*` on the main domain, you can:

### Option B: Use api.brakke.cc subdomain

1. Configure `api.brakke.cc` to point to the API container (port 4000)
2. Fix the TLS certificate for `api.brakke.cc` (currently has SSL errors)
3. Don't put `api.brakke.cc` behind Cloudflare Access
4. Update docker-compose:
   ```yaml
   environment:
     - VITE_API_URL=https://api.brakke.cc
   ```
5. Rebuild and redeploy

This takes longer (~1-2 hours) but gives more flexibility.

---

## Timeline

**Recommended**: Option A (bypass rules) - **5 minutes**

1. Add CF Access bypass rules (3 min)
2. Verify with curl (1 min)
3. Test in browser (1 min)
4. ✅ Done!

---

## Questions?

If you hit any issues or want to discuss alternatives, let me know.

The fix is simple and safe - just bypass `/api/*` and `/ws` in Cloudflare Access.

🚀
