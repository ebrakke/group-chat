# Profile Pictures Design

**Goal:** Add uploadable profile pictures displayed in chat messages (Slack-style grouped layout) to make it easy to identify who said what.

## Architecture

Users upload an avatar image via settings. The image is stored using the existing file upload system. An `avatar_file_id` column on the `users` table links to the uploaded file. Message responses include an `avatarUrl` field resolved from the user's avatar. The frontend renders a 36px avatar on the first message in each group, with initials-in-colored-circle fallback when no image is set.

## Components

1. **Migration `016_avatar.sql`** — Adds `avatar_file_id INTEGER REFERENCES files(id)` to `users` table.

2. **Backend endpoints:**
   - `PUT /api/profile/avatar` — Multipart image upload, stores file, updates user's `avatar_file_id`
   - `DELETE /api/profile/avatar` — Removes avatar, sets `avatar_file_id` to NULL

3. **Message enrichment** — `avatarUrl` field added to message responses, resolved from `userId` → `users.avatar_file_id` → `/api/files/{id}`. Also added to `GET /api/users` responses.

4. **Avatar.svelte** — Reusable component. Shows `<img>` when URL provided, falls back to colored circle with user initials. Color derived from username hash. Accepts `size` prop.

5. **Message.svelte** — First message in group shows 36px avatar left of header. Grouped (continuation) messages get left padding to align.

6. **Settings page** — Avatar upload section: shows current avatar, upload button, remove button.

## Storage

Reuses existing file upload system (`internal/files/`). No new storage mechanism needed. Avatar files stored alongside message attachments in `<DATA_DIR>/uploads/`.

## Types

- Go `User` struct: add `AvatarFileID *int64` and `AvatarURL string`
- TypeScript `User`/`Message` interfaces: add `avatarUrl?: string`
