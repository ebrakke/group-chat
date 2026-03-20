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

No schema changes. The existing `app_settings` key/value table gains three new keys:

| Key | Type | Default |
|-----|------|---------|
| `app_name` | TEXT | `Relay Chat` |
| `icon_192` | TEXT (base64 PNG) | _(empty — falls back to embedded)_ |
| `icon_512` | TEXT (base64 PNG) | _(empty — falls back to embedded)_ |

A new migration seeds `app_name = "Relay Chat"` so existing installs have an explicit value.

---

## Backend

### New / Modified HTTP Routes

All new routes are registered **before** the SPA catch-all handler so they take precedence over embedded static files.

#### `GET /manifest.json` (new explicit route)
- Reads `app_name` from `app_settings`.
- Returns manifest JSON with `name` and `short_name` set to that value.
- All other manifest fields remain static (start_url, display, theme_color, icons array).
- Response header: `Cache-Control: no-cache`.

#### `GET /icon-192.png` and `GET /icon-512.png` (new explicit routes)
- Read the corresponding base64 blob from `app_settings`.
- If the key is absent or empty, serve the embedded default PNG.
- Decode base64, write as `image/png`.
- Response header: `Cache-Control: max-age=300` (5-minute cache; short enough to reflect changes without hammering the DB).

#### `GET /` → `index.html` (modified SPA handler)
- The existing handler already has special no-cache logic for `index.html`.
- Extend it to read `app_name` from DB and replace `<title>Relay Chat</title>` with `<title>{app_name}</title>` before writing the response.
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
- Include `appName` in the response payload.
- Accept `appName` in the update payload, writing it to `app_settings` as `app_name`.

### Dependencies

- `golang.org/x/image` — already a transitive dependency in many Go projects; adds WebP decode.
- `github.com/disintegration/imaging` — small, well-maintained image resize library.

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
- On success: refresh the displayed icon (bump cache-buster param); show a brief note that PWA home screen icons may take a few minutes to update due to browser caching.
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

---

## Testing

- Unit test: image resize pipeline produces correct output dimensions and PNG format.
- Integration test: upload icon → fetch `/icon-192.png` returns custom image.
- Integration test: update `appName` → fetch `/manifest.json` reflects new name.
- Integration test: update `appName` → fetch `/` contains new `<title>`.
- Manual: install PWA before and after icon/name change; verify home screen updates.
