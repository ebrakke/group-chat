# Capacitor Mobile App — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wrap relay-chat's existing web SPA in a Capacitor Android shell with configurable server URL, so one APK works with any relay-chat instance.

**Architecture:** The existing vanilla JS frontend runs unchanged in a Capacitor WebView. A new `getApiBase()` function prepends the configured server URL to all API/WS calls on native. The Go backend adds CORS middleware to accept cross-origin requests from the native app. A new `mobile/` directory holds the Capacitor project that points to the same `frontend/dist/` build output.

**Tech Stack:** Capacitor 6, `@capacitor/core`, `@capacitor/app`, Android SDK, Bun (existing), Go (existing)

---

### Task 1: Add API base URL abstraction to frontend

**Files:**
- Modify: `frontend/src/app.js:30-37` (the `api()` function and WS connection)

**Step 1: Add getApiBase() and getWsUrl() helpers**

Add these functions near the top of `app.js`, after the global variables (after line 15, before `// Register service worker`):

```js
// --- Server URL (native app) ---

function getApiBase() {
  if (window.Capacitor?.isNativePlatform()) {
    return localStorage.getItem('serverUrl') || '';
  }
  return '';
}

function getWsUrl() {
  if (window.Capacitor?.isNativePlatform()) {
    const base = localStorage.getItem('serverUrl') || '';
    if (!base) return '';
    const url = new URL(base);
    const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${url.host}/ws`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
```

**Step 2: Update the `api()` function to use getApiBase()**

Change the existing `api()` function at line ~30:

```js
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (body) opts.body = JSON.stringify(body);
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
```

**Step 3: Update connectWS() to use getWsUrl()**

Change the `connectWS()` function at line ~61. Replace lines 62-65:

```js
function connectWS() {
  if (wsConn) { wsConn.close(); wsConn = null; }
  let url = getWsUrl();
  if (sessionToken) url += `?token=${encodeURIComponent(sessionToken)}`;
  const ws = new WebSocket(url);
```

**Step 4: Update the token-based auth for native**

The native app can't use HttpOnly cookies across origins. Find `setSessionCookie` usage — the API already returns `token` in login/bootstrap/signup responses. On native, the app must use the `Authorization: Bearer` header. Update `api()`:

```js
async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const opts = { method, headers };
  // Native app uses Bearer token; web uses cookies
  if (window.Capacitor?.isNativePlatform() && sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = "include";
  }
  if (body) opts.body = JSON.stringify(body);
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
```

**Step 5: Run frontend build to verify no syntax errors**

Run: `cd frontend && bun run build`
Expected: Build succeeds, outputs hashed JS/CSS files

**Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: add API base URL abstraction for native app support"
```

---

### Task 2: Add server URL configuration screen

**Files:**
- Modify: `frontend/src/app.js` (add renderServerConfig function, update init flow)

**Step 1: Find the init/boot flow**

The app's initialization flow is at the bottom of app.js. Search for the call to `renderLogin()` or `renderBootstrap()` and the initial `api("GET", "/api/auth/has-users")` or `api("GET", "/api/auth/me")` call. This is where we insert the server config check.

**Step 2: Add renderServerConfig() function**

Add this after the `renderLogin()` function:

```js
function renderServerConfig() {
  const saved = localStorage.getItem('serverUrl') || '';
  app.innerHTML = `
    <div class="auth-page">
      <h1>Relay Chat</h1>
      <p class="subtitle">Enter your server address</p>
      <form id="server-config-form">
        <input type="url" id="server-url" placeholder="https://chat.example.com" value="${escapeHtml(saved)}" required>
        <div class="error hidden" id="server-config-error"></div>
        <button type="submit">Connect</button>
      </form>
    </div>
  `;
  document.getElementById("server-config-form").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("server-config-error");
    errEl.classList.add("hidden");
    let url = document.getElementById("server-url").value.trim();
    // Strip trailing slash
    url = url.replace(/\/+$/, '');
    try {
      const res = await fetch(`${url}/api/health`);
      const data = await res.json();
      if (data.status !== 'ok') throw new Error('Unexpected response');
      localStorage.setItem('serverUrl', url);
      init();
    } catch {
      errEl.textContent = "Could not connect to server. Check the URL and try again.";
      errEl.classList.remove("hidden");
    }
  };
}
```

**Step 3: Update the init flow**

Find the `init()` function (or the main entry point that checks `has-users` and decides which screen to show). Add a check at the top:

```js
// At the beginning of init():
if (window.Capacitor?.isNativePlatform() && !localStorage.getItem('serverUrl')) {
  renderServerConfig();
  return;
}
```

**Step 4: Add "Change server" option to settings**

In the settings page (the `renderSettings()` function or equivalent), add a button that clears the server URL when on native:

Find the Account card section and add before the logout button (only on native):

```js
const changeServerBtn = window.Capacitor?.isNativePlatform() ? `
  <button id="settings-change-server" class="secondary" style="margin-bottom: 8px;">Change Server</button>
` : '';
```

Add the click handler:
```js
const changeServerEl = document.getElementById("settings-change-server");
if (changeServerEl) {
  changeServerEl.onclick = () => {
    localStorage.removeItem('serverUrl');
    sessionToken = null;
    currentUser = null;
    renderServerConfig();
  };
}
```

**Step 5: Run frontend build**

Run: `cd frontend && bun run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add frontend/src/app.js
git commit -m "feat: add server URL configuration screen for native app"
```

---

### Task 3: Add CORS middleware to Go backend

**Files:**
- Create: `internal/api/cors.go`
- Modify: `internal/api/api.go:49-51` (wrap ServeHTTP with CORS)

**Step 1: Write the CORS middleware test**

Create: `internal/api/cors_test.go`

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSMiddleware(t *testing.T) {
	handler := corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name           string
		origin         string
		method         string
		wantAllowed    bool
		wantStatusCode int
	}{
		{
			name:           "capacitor origin allowed",
			origin:         "capacitor://localhost",
			method:         "GET",
			wantAllowed:    true,
			wantStatusCode: http.StatusOK,
		},
		{
			name:           "http localhost allowed",
			origin:         "http://localhost",
			method:         "GET",
			wantAllowed:    true,
			wantStatusCode: http.StatusOK,
		},
		{
			name:           "preflight returns 204",
			origin:         "capacitor://localhost",
			method:         "OPTIONS",
			wantAllowed:    true,
			wantStatusCode: http.StatusNoContent,
		},
		{
			name:           "same-origin no CORS headers",
			origin:         "",
			method:         "GET",
			wantAllowed:    false,
			wantStatusCode: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, "/api/health", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatusCode {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatusCode)
			}

			acao := w.Header().Get("Access-Control-Allow-Origin")
			if tt.wantAllowed && acao != tt.origin {
				t.Errorf("ACAO = %q, want %q", acao, tt.origin)
			}
			if !tt.wantAllowed && acao != "" {
				t.Errorf("ACAO = %q, want empty", acao)
			}
		})
	}
}
```

**Step 2: Run the test to verify it fails**

Run: `go test ./internal/api/ -run TestCORS -v`
Expected: FAIL — `corsMiddleware` not defined

**Step 3: Write the CORS middleware**

Create: `internal/api/cors.go`

```go
package api

import (
	"net/http"
	"strings"
)

// allowedOrigins for Capacitor native app
var allowedOrigins = map[string]bool{
	"capacitor://localhost": true,
	"http://localhost":      true,
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func isAllowedOrigin(origin string) bool {
	if allowedOrigins[origin] {
		return true
	}
	// Also allow http://localhost:PORT for dev
	if strings.HasPrefix(origin, "http://localhost:") {
		return true
	}
	return false
}
```

**Step 4: Run the test to verify it passes**

Run: `go test ./internal/api/ -run TestCORS -v`
Expected: PASS

**Step 5: Wire CORS into the API handler**

Modify `internal/api/api.go` — update the `ServeHTTP` method:

```go
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	corsMiddleware(h.mux).ServeHTTP(w, r)
}
```

**Step 6: Run all Go tests**

Run: `go test ./internal/... -count=1`
Expected: All tests pass

**Step 7: Commit**

```bash
git add internal/api/cors.go internal/api/cors_test.go internal/api/api.go
git commit -m "feat: add CORS middleware for Capacitor native app"
```

---

### Task 4: Initialize Capacitor project

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/capacitor.config.ts`
- Generate: `mobile/android/` (via `npx cap add android`)

**Step 1: Create the mobile directory and package.json**

```bash
mkdir -p mobile
```

Create `mobile/package.json`:

```json
{
  "name": "relay-chat-mobile",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "npx cap sync android",
    "open": "npx cap open android",
    "run": "npx cap run android"
  },
  "dependencies": {
    "@capacitor/android": "^6.0.0",
    "@capacitor/app": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/cli": "^6.0.0"
  }
}
```

**Step 2: Install dependencies**

Run: `cd mobile && bun install`
Expected: Dependencies installed successfully

**Step 3: Create Capacitor config**

Create `mobile/capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.brakke.relaychat',
  appName: 'Relay Chat',
  webDir: '../frontend/dist',
  server: {
    // Allow loading from the local filesystem
    androidScheme: 'https',
  },
  plugins: {
    App: {
      // Deep link handling
    },
  },
};

export default config;
```

**Step 4: Build frontend first (Capacitor needs webDir to exist)**

Run: `cd frontend && bun install && bun run build`
Expected: `frontend/dist/` exists with built files

**Step 5: Add Android platform**

Run: `cd mobile && npx cap add android`
Expected: `mobile/android/` directory created with Gradle project

**Step 6: Sync web assets into Android project**

Run: `cd mobile && npx cap sync android`
Expected: Web assets copied, plugins synced

**Step 7: Commit (excluding large build artifacts)**

Add a `.gitignore` for the mobile directory. Create `mobile/.gitignore`:

```
node_modules/
android/.gradle/
android/app/build/
android/build/
android/app/src/main/assets/public/
```

```bash
git add mobile/
git commit -m "feat: initialize Capacitor project with Android platform"
```

---

### Task 5: Add @capacitor/core to frontend build

**Files:**
- Modify: `frontend/package.json` (add @capacitor/core dependency)
- Modify: `frontend/src/app.js` (import Capacitor at top)

**Step 1: Add @capacitor/core to frontend dependencies**

Run: `cd frontend && bun add @capacitor/core @capacitor/app`

**Step 2: Add Capacitor imports to app.js**

Add at the very top of `frontend/src/app.js`, before other imports:

```js
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
```

Then update all `window.Capacitor?.isNativePlatform()` calls to use the imported `Capacitor.isNativePlatform()` instead.

**Step 3: Add back button handler for Android**

At the bottom of the init function (or after the main app renders), add:

```js
// Android back button handling
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('backButton', ({ canGoBack }) => {
    // Close thread panel if open
    if (openThreadId) {
      closeThread();
      return;
    }
    // Close sidebar if open
    const sidebar = document.querySelector(".sidebar");
    if (sidebar && sidebar.classList.contains("sidebar-open")) {
      sidebar.classList.remove("sidebar-open");
      const backdrop = document.getElementById("sidebar-backdrop");
      if (backdrop) backdrop.classList.remove("sidebar-backdrop-visible");
      document.body.classList.remove("sidebar-is-open");
      return;
    }
    // Close settings if viewing
    if (viewingSettings) {
      viewingSettings = false;
      if (currentChannel) selectChannel(currentChannel);
      return;
    }
    // Otherwise minimize app
    CapApp.minimizeApp();
  });
}
```

**Step 4: Build frontend**

Run: `cd frontend && bun run build`
Expected: Build succeeds — Bun bundles @capacitor/core and @capacitor/app into the output

**Step 5: Commit**

```bash
git add frontend/package.json frontend/bun.lockb frontend/src/app.js
git commit -m "feat: integrate Capacitor JS SDK into frontend"
```

---

### Task 6: Update Makefile with mobile build targets

**Files:**
- Modify: `Makefile`

**Step 1: Add mobile targets to Makefile**

Add these targets after the existing ones:

```makefile
.PHONY: mobile-build mobile-sync mobile-open

mobile-sync: frontend
	cd mobile && npx cap sync android

mobile-build: mobile-sync
	cd mobile/android && ./gradlew assembleDebug
	@echo "APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk"

mobile-open: mobile-sync
	cd mobile && npx cap open android
```

Update the `help` target to include the new mobile targets:

```
@echo "  make mobile-build - Build Android APK (debug)"
@echo "  make mobile-sync  - Sync frontend to Android project"
@echo "  make mobile-open  - Open Android project in Android Studio"
```

**Step 2: Commit**

```bash
git add Makefile
git commit -m "build: add mobile build targets to Makefile"
```

---

### Task 7: Add service worker bypass for native

**Files:**
- Modify: `frontend/src/app.js` (conditional service worker registration)

**Step 1: Update service worker registration**

The service worker is registered at line ~18. It's not useful in the native app (Capacitor handles caching). Wrap it:

```js
// Register service worker (web only, not needed in native app)
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform()) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
```

Note: At this point, the Capacitor import might not be loaded yet at line 18. Use `window.Capacitor` check (Capacitor injects this global before app code runs in native context).

**Step 2: Build and verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/app.js
git commit -m "fix: skip service worker registration in native app"
```

---

### Task 8: End-to-end verification

**Step 1: Build the full stack**

Run: `make build`
Expected: Go binary builds with embedded frontend assets

**Step 2: Run existing tests**

Run: `go test ./internal/... -count=1`
Expected: All tests pass

**Step 3: Build the APK**

Run: `make mobile-build` (requires Android SDK)
If Android SDK is not available locally, verify that `make mobile-sync` works (this confirms Capacitor project is properly configured).

**Step 4: Manual testing checklist (for when Android device/emulator is available)**

- [ ] App launches and shows server URL config screen
- [ ] Entering a valid server URL connects and shows login
- [ ] Login works and chat loads in the WebView
- [ ] Messages load, WebSocket connection establishes
- [ ] Sending a message works
- [ ] Back button closes thread panel → sidebar → minimizes app
- [ ] "Change server" in settings clears URL and shows config screen
- [ ] Web PWA still works normally (no regression)

**Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes for Capacitor mobile"
```

---

## What This Plan Does NOT Cover (Phase 2 & 3)

These are deferred to separate plans:

**Phase 2 — Push Notifications:**
- `device_push_tokens` DB migration
- `NtfyProvider` in `internal/notifications/`
- Device registration API endpoints
- ntfy Android library integration
- Deep linking from notifications

**Phase 3 — Native Features:**
- Camera plugin + file upload API
- Share plugin
- Filesystem plugin
- Native navigation improvements
