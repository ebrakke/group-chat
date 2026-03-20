# Instance Branding (Name & Icon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to set a custom app name and icon that propagate to the PWA manifest, browser tab title, and home screen — served dynamically from the database at runtime.

**Architecture:** Static `manifest.json` and icon files are deleted from `frontend/static/` and replaced with Go HTTP handlers that read `app_name`, `icon_192`, and `icon_512` from the existing `app_settings` DB table. The `index.html` SPA handler is extended to inject the `app_name` into the `<title>` tag. Icon uploads are processed server-side (decode → resize → PNG encode → base64 store).

**Tech Stack:** Go (`image/*`, `golang.org/x/image/webp`, `github.com/disintegration/imaging`), SQLite (`app_settings` table), SvelteKit 5 runes, Tailwind v4.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `internal/db/migrations/022_instance_branding.sql` | Seeds `app_name = 'Relay Chat'` default row |
| Create | `internal/branding/branding.go` | Image decode/resize/encode + embedded default icons |
| Create | `internal/branding/branding_test.go` | Unit tests for image processing |
| Create | `internal/branding/defaults/icon-192.png` | Default icon (moved from frontend/static) |
| Create | `internal/branding/defaults/icon-512.png` | Default icon (moved from frontend/static) |
| Modify | `cmd/app/main.go` | Add dynamic routes; modify spaHandler for title injection |
| Modify | `internal/api/api.go` | Add icon upload route + handler; update settings handlers |
| Modify | `frontend/src/service-worker.ts` | Network-first for manifest/icon paths |
| Modify | `frontend/src/routes/(app)/settings/+page.svelte` | Add Branding admin section |
| Delete | `frontend/static/manifest.json` | Replaced by dynamic Go handler |
| Delete | `frontend/static/icon-192.png` | Moved to `internal/branding/defaults/` |
| Delete | `frontend/static/icon-512.png` | Moved to `internal/branding/defaults/` |

---

## Task 1: Move default icons and add DB migration

**Files:**
- Create: `internal/branding/defaults/icon-192.png` (moved from `frontend/static/icon-192.png`)
- Create: `internal/branding/defaults/icon-512.png` (moved from `frontend/static/icon-512.png`)
- Delete: `frontend/static/icon-192.png`
- Delete: `frontend/static/icon-512.png`
- Delete: `frontend/static/manifest.json`
- Create: `internal/db/migrations/022_instance_branding.sql`

- [ ] **Step 1: Create the branding defaults directory and move icons**

```bash
mkdir -p internal/branding/defaults
cp frontend/static/icon-192.png internal/branding/defaults/icon-192.png
cp frontend/static/icon-512.png internal/branding/defaults/icon-512.png
rm frontend/static/icon-192.png
rm frontend/static/icon-512.png
rm frontend/static/manifest.json
```

- [ ] **Step 2: Write the migration**

Create `internal/db/migrations/022_instance_branding.sql`:

```sql
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('app_name', 'Relay Chat', datetime('now'));
```

- [ ] **Step 3: Verify the migration is picked up**

Open `internal/db/db.go` and confirm line 18 reads:
```go
//go:embed migrations/*.sql
var migrationsFS embed.FS
```
This glob picks up every `*.sql` file in the `migrations/` directory automatically. The new `022_instance_branding.sql` file will be included at next build since it sorts after `021_*` alphabetically. No code change needed.

- [ ] **Step 4: Commit**

```bash
git add internal/branding/defaults/ internal/db/migrations/022_instance_branding.sql
git rm frontend/static/icon-192.png frontend/static/icon-512.png frontend/static/manifest.json
git commit -m "feat: move default icons to internal/branding/defaults, add app_name migration"
```

---

## Task 2: Branding package — image processing (TDD)

**Files:**
- Create: `internal/branding/branding.go`
- Create: `internal/branding/branding_test.go`

- [ ] **Step 1: Add dependencies**

```bash
cd /path/to/repo  # run from repo root
go get golang.org/x/image
go get github.com/disintegration/imaging
```

- [ ] **Step 2: Write the failing tests**

Create `internal/branding/branding_test.go`:

```go
package branding_test

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/ebrakke/relay-chat/internal/branding"
)

func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 255, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode test PNG: %v", err)
	}
	return buf.Bytes()
}

func TestProcessIcon_ResizesToSquare(t *testing.T) {
	src := makePNG(t, 400, 300) // non-square source

	got, err := branding.ProcessIcon(src, 192)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("result is not valid base64: %v", err)
	}

	result, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		t.Fatalf("result is not a valid image: %v", err)
	}

	bounds := result.Bounds()
	if bounds.Dx() != 192 || bounds.Dy() != 192 {
		t.Errorf("expected 192x192, got %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestProcessIcon_512(t *testing.T) {
	src := makePNG(t, 600, 600)

	got, err := branding.ProcessIcon(src, 512)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	decoded, _ := base64.StdEncoding.DecodeString(got)
	result, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		t.Fatalf("result is not a valid image: %v", err)
	}

	bounds := result.Bounds()
	if bounds.Dx() != 512 || bounds.Dy() != 512 {
		t.Errorf("expected 512x512, got %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestProcessIcon_RejectsInvalidData(t *testing.T) {
	_, err := branding.ProcessIcon([]byte("not an image"), 192)
	if err == nil {
		t.Error("expected error for invalid image data, got nil")
	}
}

func TestDefaultIcons_AreValid(t *testing.T) {
	for name, data := range map[string][]byte{
		"DefaultIcon192": branding.DefaultIcon192,
		"DefaultIcon512": branding.DefaultIcon512,
	} {
		if len(data) == 0 {
			t.Errorf("%s: embedded data is empty", name)
			continue
		}
		_, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			t.Errorf("%s: not a valid image: %v", name, err)
		}
	}
}
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
go test ./internal/branding/...
```

Expected: compilation error — package `branding` does not exist yet.

- [ ] **Step 4: Implement the branding package**

Create `internal/branding/branding.go`:

```go
package branding

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"

	"github.com/disintegration/imaging"
	_ "golang.org/x/image/webp"

	_ "embed"
)

//go:embed defaults/icon-192.png
var DefaultIcon192 []byte

//go:embed defaults/icon-512.png
var DefaultIcon512 []byte

// ProcessIcon decodes src (PNG, JPEG, or WebP), centre-crops and resizes it to
// a size×size square, encodes it as PNG, and returns the base64-encoded result.
func ProcessIcon(src []byte, size int) (string, error) {
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return "", fmt.Errorf("decode image: %w", err)
	}
	resized := imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)
	var buf bytes.Buffer
	if err := png.Encode(&buf, resized); err != nil {
		return "", fmt.Errorf("encode png: %w", err)
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
go test ./internal/branding/... -v
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/branding/ go.mod go.sum
git commit -m "feat: add branding package with image resize and embedded defaults"
```

---

## Task 3: Dynamic manifest and icon routes in main.go

**Files:**
- Modify: `cmd/app/main.go`

- [ ] **Step 1: Update imports in main.go**

Add to the import block:

```go
"bytes"
"encoding/base64"
"encoding/json"
"html"

"github.com/ebrakke/relay-chat/internal/branding"
```

- [ ] **Step 2: Add the `getAppName` helper after `notifySvc` is created (around line 91)**

Insert after `notifySvc := notifications.NewService(database, baseURL)`:

```go
getAppName := func() string {
    settings, err := notifySvc.GetAppSettings()
    if err != nil {
        return "Relay Chat"
    }
    if name, ok := settings["app_name"]; ok && name != "" {
        return name
    }
    return "Relay Chat"
}
```

- [ ] **Step 3: Register dynamic branding routes before the SPA handler (before line 194)**

Insert before `mux.Handle("/", spaHandler(staticSub))`:

```go
// Dynamic branding: manifest served from DB
mux.HandleFunc("GET /manifest.json", func(w http.ResponseWriter, r *http.Request) {
    appName := getAppName()
    manifest := map[string]interface{}{
        "name":             appName,
        "short_name":       appName,
        "description":      "Private group chat",
        "start_url":        "/",
        "display":          "standalone",
        "background_color": "#0d1117",
        "theme_color":      "#0d1117",
        "orientation":      "portrait",
        "icons": []map[string]string{
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        },
    }
    w.Header().Set("Content-Type", "application/manifest+json")
    w.Header().Set("Cache-Control", "no-cache")
    json.NewEncoder(w).Encode(manifest)
})

// Dynamic branding: icons served from DB, fallback to embedded defaults
iconHandler := func(key string, defaultIcon []byte) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        iconData := defaultIcon
        settings, err := notifySvc.GetAppSettings()
        if err == nil {
            if b64, ok := settings[key]; ok && b64 != "" {
                if decoded, err := base64.StdEncoding.DecodeString(b64); err == nil {
                    iconData = decoded
                }
            }
        }
        w.Header().Set("Content-Type", "image/png")
        w.Header().Set("Cache-Control", "public, max-age=300")
        w.Write(iconData)
    }
}
mux.HandleFunc("GET /icon-192.png", iconHandler("icon_192", branding.DefaultIcon192))
mux.HandleFunc("GET /icon-512.png", iconHandler("icon_512", branding.DefaultIcon512))
```

- [ ] **Step 4: Update the spaHandler call to pass `getAppName`**

Change:
```go
mux.Handle("/", spaHandler(staticSub))
```
To:
```go
mux.Handle("/", spaHandler(staticSub, getAppName))
```

- [ ] **Step 5: Update the `spaHandler` function signature and add title injection**

Replace the entire `spaHandler` function (lines 203–235) with:

```go
// spaHandler serves static files, falling back to index.html for SPA routing.
// Hashed assets (app.XXXX.js, style.XXXX.css) get long-lived cache headers.
// index.html is served with the app name injected into the <title> tag.
// sw.js is never cached so updates propagate immediately.
func spaHandler(fsys fs.FS, getAppName func() string) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// index.html: inject app name into <title>
		serveIndex := func() {
			content, err := fs.ReadFile(fsys, "index.html")
			if err != nil {
				http.Error(w, "index.html not found", http.StatusInternalServerError)
				return
			}
			appName := html.EscapeString(getAppName())
			content = bytes.ReplaceAll(content,
				[]byte("<title>Relay Chat</title>"),
				[]byte("<title>"+appName+"</title>"),
			)
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(content)
		}

		// Try to open the file
		f, err := fsys.Open(path)
		if err != nil {
			// File not found -> serve index.html for SPA routing
			serveIndex()
			return
		}
		f.Close()

		if path == "index.html" {
			serveIndex()
			return
		}

		// Cache-Control based on file type
		if path == "sw.js" {
			w.Header().Set("Cache-Control", "no-cache")
		} else if strings.Contains(path, ".") && (strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css")) {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		fileServer.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 6: Build to verify it compiles**

```bash
go build ./cmd/app/...
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add cmd/app/main.go
git commit -m "feat: serve manifest.json, icons, and index.html title dynamically from DB"
```

---

## Task 4: Icon upload API + settings handler updates

**Files:**
- Modify: `internal/api/api.go`

- [ ] **Step 1: Add imports to api.go**

Add to the import block (check what's already there first):

```go
"io"

"github.com/ebrakke/relay-chat/internal/branding"
```

- [ ] **Step 2: Register the new icon upload route in `routes()`**

In the `routes()` function, after the existing admin settings lines (after line 158):

```go
h.mux.HandleFunc("POST /api/admin/settings/icon", h.handleUploadIcon)
```

- [ ] **Step 3: Update `handleGetAdminSettings` to include `appName`**

In the `switch k` block inside `handleGetAdminSettings`, add a case after `"base_url"`:

```go
case "app_name":
    response["appName"] = v
```

The full switch becomes:
```go
switch k {
case "base_url":
    response["baseUrl"] = v
case "app_name":
    response["appName"] = v
default:
    response[k] = v
}
```

- [ ] **Step 4: Update `handleUpdateAdminSettings` to block icon blob keys**

The existing frontend sends snake_case keys directly to this endpoint (e.g. `saveBaseUrl` sends `{ base_url: ... }`). The new `saveAppName` will follow the same convention and send `{ app_name: ... }`. No camelCase translation is needed on the write path — this matches the existing pattern.

What IS needed: block `icon_192` and `icon_512` from being written here (they must only be written via the dedicated icon endpoint).

Replace the `UpdateAppSettings` call in `handleUpdateAdminSettings` with a filtered version:

```go
// icon_192 and icon_512 are only writable via POST /api/admin/settings/icon
protected := map[string]bool{"icon_192": true, "icon_512": true}
filtered := make(map[string]string, len(req))
for k, v := range req {
    if !protected[k] {
        filtered[k] = v
    }
}

if err := h.notifications.UpdateAppSettings(filtered); err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
}
```

- [ ] **Step 5: Write the `handleUploadIcon` handler**

Add this function after `handleUpdateAdminSettings`:

```go
func (h *Handler) handleUploadIcon(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		http.Error(w, "admin only", http.StatusForbidden)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "file too large (max 10MB)", http.StatusRequestEntityTooLarge)
		return
	}

	file, header, err := r.FormFile("icon")
	if err != nil {
		http.Error(w, "missing 'icon' field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ct := header.Header.Get("Content-Type")
	if ct != "image/png" && ct != "image/jpeg" && ct != "image/webp" {
		http.Error(w, "unsupported format: use PNG, JPG, or WebP", http.StatusUnsupportedMediaType)
		return
	}

	src, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read upload", http.StatusInternalServerError)
		return
	}

	icon192, err := branding.ProcessIcon(src, 192)
	if err != nil {
		http.Error(w, "failed to process image: "+err.Error(), http.StatusBadRequest)
		return
	}
	icon512, err := branding.ProcessIcon(src, 512)
	if err != nil {
		http.Error(w, "failed to process image: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.notifications.UpdateAppSettings(map[string]string{
		"icon_192": icon192,
		"icon_512": icon512,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
```

- [ ] **Step 6: Build to verify it compiles**

```bash
go build ./...
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add icon upload endpoint, expose appName in admin settings API"
```

---

## Task 5: Service worker — network-first for dynamic paths

**Files:**
- Modify: `frontend/src/service-worker.ts`

The `files` variable from `$service-worker` is populated from `frontend/static/`. Now that `manifest.json`, `icon-192.png`, and `icon-512.png` are deleted from there, they naturally drop out of `ASSETS`. But the cache-first fallback would still serve them stale if they were previously cached. We add a network-first handler for these paths.

- [ ] **Step 1: Update service-worker.ts**

Replace the current `fetch` handler section (lines 30–54) with:

```ts
const DYNAMIC_BRANDING = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip API, WebSocket, and relay requests
	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/ws') ||
		url.pathname.startsWith('/relay')
	) {
		return;
	}

	// Network-first for dynamic branding assets (name + icons change at runtime)
	if (DYNAMIC_BRANDING.some((p) => url.pathname === p)) {
		event.respondWith(
			fetch(event.request).catch(() => caches.match(event.request) as Promise<Response>)
		);
		return;
	}

	// Navigation: network first, fallback to cached shell
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(() => caches.match('/index.html') as Promise<Response>)
		);
		return;
	}

	// Static assets: cache first
	event.respondWith(
		caches.match(event.request).then((cached) => cached || fetch(event.request)) as Promise<Response>
	);
});
```

- [ ] **Step 2: Build the frontend to verify**

```bash
cd frontend && bun run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service-worker.ts
git commit -m "feat: use network-first strategy for manifest and icon paths in service worker"
```

---

## Task 6: Frontend branding UI

**Files:**
- Modify: `frontend/src/routes/(app)/settings/+page.svelte`

- [ ] **Step 1: Add branding state variables**

In the `<script>` block, after the `// --- Admin Settings ---` block (around line 32), add:

```ts
// --- Branding ---
let appName = $state('');
let savingAppName = $state(false);
let appNameMessage = $state('');
let appNameError = $state('');
let iconPreviewUrl = $state('');
let iconFile = $state<File | null>(null);
let uploadingIcon = $state(false);
let iconMessage = $state('');
let iconError = $state('');
let iconCacheBuster = $state(Date.now());
```

- [ ] **Step 2: Update `loadAdminSettings` to fetch `appName`**

Replace the existing `loadAdminSettings` function:

```ts
async function loadAdminSettings() {
  try {
    const settings = await api<{ baseUrl?: string; appName?: string }>(
      'GET',
      '/api/admin/settings'
    );
    baseUrl = settings.baseUrl || '';
    appName = settings.appName || '';
  } catch {
    toastStore.error('Failed to load settings');
  }
}
```

- [ ] **Step 3: Add `saveAppName` and `uploadIcon` functions**

Add after `saveBaseUrl`:

```ts
async function saveAppName() {
  savingAppName = true;
  appNameError = '';
  appNameMessage = '';
  try {
    // Send snake_case key — matches the existing convention used by saveBaseUrl ({ base_url: ... })
    await api('POST', '/api/admin/settings', { app_name: appName });
    appNameMessage = 'App name saved';
    autoHide((v) => (appNameMessage = v));
  } catch (err: unknown) {
    appNameError = err instanceof Error ? err.message : 'Failed to save';
    autoHide((v) => (appNameError = v));
  } finally {
    savingAppName = false;
  }
}

function handleIconSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  iconFile = file;
  iconPreviewUrl = URL.createObjectURL(file);
}

async function uploadIcon() {
  if (!iconFile) return;
  uploadingIcon = true;
  iconError = '';
  iconMessage = '';
  try {
    // Use fetch directly (not api()) — api() always sets Content-Type: application/json
    // and JSON-serializes the body, which breaks multipart uploads.
    // This matches the pattern used by uploadFile() and uploadAvatar() in api.ts.
    const form = new FormData();
    form.append('icon', iconFile);
    const res = await fetch('/api/admin/settings/icon', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `Upload failed (${res.status})`);
    iconMessage = 'Icon updated';
    iconCacheBuster = Date.now();
    iconFile = null;
    iconPreviewUrl = '';
    autoHide((v) => (iconMessage = v));
  } catch (err: unknown) {
    iconError = err instanceof Error ? err.message : 'Failed to upload';
    autoHide((v) => (iconError = v));
  } finally {
    uploadingIcon = false;
  }
}
```

- [ ] **Step 4: Add the Branding UI section**

In the template, insert a new `<div>` block **before** the `<!-- General Settings -->` block (before line 522), inside `{#if authStore.isAdmin}`:

```svelte
<!-- Branding -->
<div class="border p-4" style="border-color: var(--border);">
  <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">branding</h3>

  <!-- App Name -->
  <label class="block mb-3">
    <span class="text-[12px] mb-1 block" style="color: var(--rc-timestamp);">app name</span>
    <input type="text" bind:value={appName} placeholder="Relay Chat"
           class="w-full border px-3 py-2 text-[12px] font-mono outline-none"
           style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
  </label>
  {#if appNameMessage}<p class="text-[11px] mb-2" style="color: var(--rc-olive);">{appNameMessage}</p>{/if}
  {#if appNameError}<p class="text-[11px] mb-2" style="color: var(--rc-mention-badge);">{appNameError}</p>{/if}
  <button onclick={saveAppName} disabled={savingAppName}
          class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40 mb-5"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
    {savingAppName ? 'saving...' : 'save name'}</button>

  <!-- App Icon -->
  <div>
    <span class="text-[12px] mb-2 block" style="color: var(--rc-timestamp);">app icon</span>
    <div class="flex items-start gap-4">
      <img src="/icon-192.png?v={iconCacheBuster}" alt="current app icon"
           class="w-12 h-12 border" style="border-color: var(--border);" />
      {#if iconPreviewUrl}
        <div class="flex flex-col gap-1">
          <span class="text-[11px]" style="color: var(--rc-timestamp);">preview:</span>
          <img src={iconPreviewUrl} alt="icon preview" class="w-12 h-12 border" style="border-color: var(--border);" />
        </div>
      {/if}
    </div>
    <label class="mt-2 block">
      <span class="text-[11px] mb-1 block" style="color: var(--rc-timestamp);">upload PNG, JPG, or WebP</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" onchange={handleIconSelect}
             class="text-[11px]" style="color: var(--foreground);" />
    </label>
    {#if iconMessage}<p class="text-[11px] mt-2" style="color: var(--rc-olive);">{iconMessage}</p>{/if}
    {#if iconError}<p class="text-[11px] mt-2" style="color: var(--rc-mention-badge);">{iconError}</p>{/if}
    {#if iconFile}
      <button onclick={uploadIcon} disabled={uploadingIcon}
              class="mt-2 px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
              style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
        {uploadingIcon ? 'uploading...' : 'upload icon'}</button>
    {/if}
  </div>
</div>
```

- [ ] **Step 5: Verify no `api()` call is used for the icon upload**

`frontend/src/lib/api.ts` unconditionally sets `Content-Type: application/json` and calls `JSON.stringify(body)`. Passing `FormData` to `api()` would serialize it as `{}` and send the wrong content type. The `uploadIcon` function above uses `fetch` directly to avoid this — exactly as the existing `uploadFile` and `uploadAvatar` helpers in `api.ts` do. Confirm the `uploadIcon` function in the svelte page does not call `api()` for the icon POST.

- [ ] **Step 6: Build the frontend**

```bash
cd frontend && bun run build 2>&1 | tail -30
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/(app)/settings/+page.svelte
git commit -m "feat: add branding section to admin settings (app name + icon upload)"
```

---

## Task 7: Full build + smoke test

**Files:** none new

- [ ] **Step 1: Run all Go tests**

```bash
go test ./...
```

Expected: all tests pass.

- [ ] **Step 2: Full build**

```bash
make build
```

Expected: builds successfully — frontend + Go binary.

- [ ] **Step 3: Start dev server and smoke test**

```bash
make dev
```

In a browser at http://localhost:8080:

1. Log in as admin.
2. Go to Settings → verify "branding" section appears.
3. Change app name to "My Test Chat" → save.
4. Reload page → confirm `<title>My Test Chat</title>` in page source.
5. Fetch `http://localhost:8080/manifest.json` → confirm `"name": "My Test Chat"`.
6. Upload a PNG icon → confirm preview appears → click upload.
7. Fetch `http://localhost:8080/icon-192.png` → confirm it's the new icon.
8. Restore app name to "Relay Chat" to leave dev env clean.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify build passes for instance branding feature"
```
