# Relay Chat v1 Roadmap

**Date:** 2026-02-28
**Goal:** Make Relay Chat a viable, shareable self-hosted chat app for technical self-hosters.
**Deployment model:** Single Go binary with embedded frontend. No Docker required.

## Context

Relay Chat is a self-hosted group chat app built on Go + SvelteKit 5. Core functionality exists (channels, threads, reactions, mentions, bots, notifications, mobile app, invite system, admin tools), but key features are missing and UX rough edges prevent sharing it widely.

The Nostr/NIP-29 relay is vestigial - the app DB is the sole source of truth, the relay endpoint is unused by the app or frontend. It will be left in place for now but is not load-bearing.

## Priority Order

### 1. File/Image Uploads

**Problem:** Can't share images, screenshots, or files in chat.

**Design:**
- Upload via drag-and-drop, clipboard paste, or file picker in message input
- Images render as inline thumbnails, click to expand full-size
- Non-image files render as download links with filename and size
- Storage: local filesystem by default (`DATA_DIR/uploads/`), optional S3-compatible backend via env vars (`UPLOAD_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`)
- Configurable max file size (default 10MB, env `MAX_UPLOAD_SIZE`)
- Files served through Go backend with session auth check (no public URLs)
- Upload returns a file ID/URL that gets embedded in the message content

### 2. Message Editing & Deletion

**Problem:** Can't fix typos or remove messages after sending.

**Design:**
- Users can edit their own messages (no time limit)
- Edited messages show "(edited)" indicator with timestamp
- Users can delete their own messages; admins can delete any message
- Soft delete: message content replaced with "message deleted" placeholder, row retained
- Edits and deletes broadcast via WebSocket (`message_edited`, `message_deleted` events)
- Edit history not stored (only latest version kept)

### 3. Search

**Problem:** Can't find past messages.

**Design:**
- SQLite FTS5 virtual table for full-text message search
- Search UI accessible from sidebar or header
- Filters: channel, user, date range
- Results show message snippet with context, click navigates to message in channel
- Populate FTS table via trigger on message insert/update

### 4. Configurable APK Builds

**Problem:** Mobile APK is hardcoded to `chat.brakke.cc`.

**Design:**
- `make mobile-build URL=https://chat.example.com` sets server URL at build time
- Remove hardcoded URL from `capacitor.config.ts`
- Generate config dynamically or use build-time substitution
- Document the full APK build process for admins (requirements: Android SDK, Bun)

### 5. Mobile UX Fixes

**Problem:** Mobile experience has layout issues and unreliable gestures.

**Design:**
- Audit sticky header/input positioning with virtual keyboard
- Fix swipe gesture edge detection reliability
- Test and fix notification flow end-to-end (foreground service, local notifications)
- Android only (no iOS target)

### 6. Notification Reliability

**Problem:** Notifications are flaky and hard to configure.

**Design:**
- Audit webhook delivery (retries, timeouts, error reporting)
- Audit ntfy.sh integration path
- Add "send test notification" button in admin/settings UI
- Improve notification preference UI - make it more discoverable

### 7. General UI Polish

**Problem:** Small rough edges erode trust across the app.

**Design:**
- Add loading states for async operations (message send, channel switch, initial load)
- Add meaningful error states (not silent failures)
- Add empty states (no messages, no channels, first-time views)
- Consistent spacing, transitions, hover/active states

### 8. Stability & Hardening

**Problem:** Edge cases and missing safeguards.

**Design:**
- Rate limiting on auth endpoints (login, bootstrap, invite redemption)
- WebSocket reconnection audit (network switches, sleep/wake, stale sessions)
- Handle concurrent edit edge cases
- Basic request size limits

### 9. Release Packaging & Documentation

**Problem:** No easy way for someone else to install and run it.

**Design:**
- Embed version string at build time (`relay-chat --version`)
- Publish pre-built binaries for linux/amd64 (GitHub/Forgejo releases)
- README: what it is, screenshot, quickstart command, configuration reference
- Document all env vars, data directory structure
- Document backup procedure (copy SQLite files while app is stopped, or use `.backup` command)

## Non-Goals

- Docker/container packaging (binary is sufficient for target audience)
- iOS support
- Nostr relay removal (leave in place, not load-bearing)
- PostgreSQL migration (SQLite is fine for target scale)
- Managed hosting or SaaS features
