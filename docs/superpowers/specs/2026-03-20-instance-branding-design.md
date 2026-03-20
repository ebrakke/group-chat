# Instance Branding (Name & Icon) — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Problem

All Relay Chat instances share the same hardcoded name ("Relay Chat") and icons. When multiple instances are installed as PWAs, they are indistinguishable on the home screen. Admins need to customise the instance name and icon at runtime without rebuilding the binary.

## Goals

- Admin can set a custom app name that propagates to the PWA manifest, browser tab title, and any other name references.
- Admin can upload a custom icon (PNG, JPG, or WebP); the server auto-generates the required sizes (192×192 and 512×512).
- No server restart required after changes.
- Existing installs continue to work with sensible defaults ("Relay Chat" name, current embedded icons).

## Out of Scope

- SVG icon upload (rasterisation is complex; deferred).
- Per-user or per-channel branding.
- Separate "full name" and "short name" fields (single name field for now).

---

## Data Model

No changes to the table structure. A new migration seeds three default rows into the existing `app_settings` key/value table:

| Key | Type | Default |
|-----|------|---------|
| `app_name` | TEXT | `Relay Chat` |
| `icon_192` | TEXT (base64 PNG) | _(empty — falls back to embedded)_ |
| `icon_512` | TEXT (base64 PNG) | _(empty — falls back to embedded)_ |

`icon_192` and `icon_512` are **write-only through `POST /api/admin/settings/icon`**. The general `POST /api/admin/settings` endpoint must ignore (or reject) these keys — they bypass the resize pipeline if written directly.

---

## Backend

### Static File Changes

`manifest.json`, `icon-192.png`, and `icon-512.png` must be **deleted from `frontend/static/`**. The embedded FS in the built binary must not contain these files. If they remain embedded, the `spaHandler`'s FS lookup will serve the static versions before the explicit routes are ever reached, because the `spaHandler` is registered as a catch-all `/` handler and it serves files directly from the embedded FS before falling through to index.html.

### New / Modified HTTP Routes

All new routes are registered on the mux **before** the SPA catch-all handler.

#### `GET /manifest.json` (new explicit route)
- Reads `app_name` from `app_settings`.
- Returns manifest JSON with `name` and `short_name` set to that value.
- All other manifest fields remain static (start_url, display, theme_color, icons array).
- Response header: `Cache-Control: no-cache`.

#### `GET /icon-192.png` and `GET /icon-512.png` (new explicit routes)
- Read the corresponding base64 blob from `app_settings`.
- If the key is absent or empty, serve the embedded default PNG (kept separately in Go source as a byte literal or loaded via `go:embed` from a non-static path, since the files are removed from `frontend/static/`).
- Decode base64, write as `image/png`.
- Response header: `Cache-Control: max-age=300` (5-minute cache; short enough to reflect changes without hammering the DB).

#### `GET /` → `index.html` (modified SPA handler)
- The existing handler already has special no-cache logic for `index.html`.
- Extend it to read `app_name` from DB, HTML-escape the value (`html.EscapeString`), and replace `<title>Relay Chat</title>` with `<title>{escaped_app_name}</title>` before writing the response.
- HTML escaping is required: an app name containing `<`, `>`, `&`, or `"` must not produce malformed HTML.
- DB read is per-request but cheap; can be memoised with a short TTL if needed later.

#### `POST /api/admin/settings/icon` (new)
- Admin-only (existing auth middleware).
- Accepts `multipart/form-data` with a single `icon` file field.
- Accepted MIME types: `image/png`, `image/jpeg`, `image/webp`.
- Processing pipeline:
  1. Decode image using Go standard library (`image/png`, `image/jpeg`) + `golang.org/x/image/webp`.
  2. Resize/crop to 192×192 and 512×512 using `github.com/disintegration/imaging` (Lanczos resampling, centre crop to maintain aspect ratio).
  3. Encode both as PNG.
  4. Base64-encode and store as `icon_192` / `icon_512` in `app_settings`.
- Returns `200 OK` on success; appropriate 4xx on bad input.
- Max upload size: 10 MB.

#### `GET /api/admin/settings` and `POST /api/admin/settings` (modified)
- Include `appName` in the GET response payload (read path translates `app_name` → `appName`).
- The POST handler receives `app_name` (snake_case) from the frontend — matching the existing `base_url` convention used by `saveBaseUrl`. No server-side key translation is needed on the write path; the value is stored verbatim as `app_name`.
- The POST handler must **ignore** `icon_192` / `icon_512` keys. Only `POST /api/admin/settings/icon` is permitted to write icon blobs.

### Service Worker

The current service worker (`service-worker.js`) precaches `manifest.json`, `icon-192.png`, and `icon-512.png` using a cache-first strategy. Without changes, admin updates to the name or icon will not be seen by browsers that have the SW active until a new build (and new SW hash) is deployed.

The service worker source must be updated to:
1. Remove `manifest.json`, `icon-192.png`, and `icon-512.png` from the precache list.
2. Add a network-first fetch handler for those three paths (fetch from network; on failure, fall back to cache).

This ensures icon/name changes are picked up on the next page load without waiting for a new deployment.

### Dependencies

- `golang.org/x/image` — add as a direct dependency if not already present; provides WebP decode (`golang.org/x/image/webp`).
- `github.com/disintegration/imaging` — add as a direct dependency; provides image resizing.

---

## Frontend

A new **Branding** section is added at the top of the existing admin settings block in `frontend/src/routes/(app)/settings/+page.svelte`. It is guarded by the existing `authStore.isAdmin` check.

### App Name

- Text input bound to the `appName` setting.
- Saves via the existing `POST /api/admin/settings` call (no new API surface needed).
- Inline save button; shows success/error feedback.

### App Icon

- Displays the current icon fetched from `/icon-192.png` (with a cache-busting query param on update).
- File input below, labelled "Upload icon (PNG, JPG, or WebP)".
- On file select: show a local `URL.createObjectURL` preview before committing.
- Confirm button `POST`s to `/api/admin/settings/icon` as multipart.
- On success: refresh the displayed icon (bump cache-buster param).
- On error: display the server error message.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Unsupported icon format | 415 from server; frontend shows "Unsupported format. Use PNG, JPG, or WebP." |
| Icon too large (>10 MB) | 413 from server; frontend shows "File too large (max 10 MB)." |
| DB read fails during manifest/icon serve | Fall back to embedded defaults; log error server-side. |
| DB read fails during index.html serve | Serve page with original hardcoded title; log error. |
| `app_name` not set in DB | Default to `"Relay Chat"` in all serving code. |
| `icon_192`/`icon_512` sent to general settings endpoint | Ignore the keys silently (or return 400). |

---

## Testing

- Unit test: image resize pipeline produces correct output dimensions and PNG format for each accepted input type.
- Integration test: upload icon → fetch `/icon-192.png` returns custom image.
- Integration test: update `appName` → fetch `/manifest.json` reflects new name.
- Integration test: update `appName` → fetch `/` contains properly HTML-escaped `<title>`.
- Integration test: sending `icon_192` to `POST /api/admin/settings` does not overwrite the icon blob.
- Manual: verify SW does not serve stale manifest/icons after a name or icon change.
- Manual: install PWA before and after icon/name change; verify home screen updates.
