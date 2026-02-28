# Profile Pictures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add uploadable profile pictures with Slack-style grouped display in chat messages.

**Architecture:** A `profile_picture_id` column on `users` references the existing `files` table. Message SQL queries JOIN users to include avatar URL. Frontend shows 36px avatars on first message in each group, with colored-initial fallback. Settings page gets upload/remove UI.

**Tech Stack:** Go, SQLite, Svelte 5 runes, Tailwind v4, existing file upload system

---

### Task 1: Database migration and User struct update

**Files:**
- Create: `internal/db/migrations/016_avatar.sql`
- Modify: `internal/auth/auth.go`

**Step 1: Create migration file**

Create `internal/db/migrations/016_avatar.sql`:

```sql
ALTER TABLE users ADD COLUMN profile_picture_id INTEGER REFERENCES files(id) ON DELETE SET NULL;
```

**Step 2: Add AvatarURL to User struct**

In `internal/auth/auth.go`, change the User struct (lines 27-34) from:

```go
type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	CreatedAt   string `json:"createdAt"`
	IsBot       bool   `json:"isBot,omitempty"`
}
```

To:

```go
type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	CreatedAt   string `json:"createdAt"`
	IsBot       bool   `json:"isBot,omitempty"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
}
```

**Step 3: Update all user-querying functions to include avatar URL**

All functions that scan users need to SELECT and populate `avatarUrl`. The avatar URL is computed as `/api/files/{id}` when `profile_picture_id IS NOT NULL`.

Update `ValidateSession` (line 134-138). Change:
```go
err := s.db.QueryRow(`
    SELECT u.id, u.username, u.display_name, u.role, u.created_at
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
`, token).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt)
```
To:
```go
var avatarFileID sql.NullInt64
err := s.db.QueryRow(`
    SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.profile_picture_id
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
`, token).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt, &avatarFileID)
```
Then after `u.IsBot = u.Role == "bot"`, add:
```go
if avatarFileID.Valid {
    u.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
}
```

Add `"database/sql"` and `"fmt"` to imports if not already present.

Apply the same pattern to these functions:

- `Login` (line 108-111): Add `profile_picture_id` to SELECT, scan into `avatarFileID`, set `AvatarURL` before returning the User literal on line 128.

- `GetUserByID` (line 231-232): Add `profile_picture_id` to SELECT, scan it, set `AvatarURL` before returning.

- `SearchUsers` (line 247-248): Add `profile_picture_id` to SELECT, scan it in the loop, set `AvatarURL`.

- `ListUsers` (line 269): Add `profile_picture_id` to SELECT, scan it in the loop, set `AvatarURL`.

**Step 4: Add SetProfilePicture and ClearProfilePicture methods**

Add to `internal/auth/auth.go` after `ChangePassword` (after line 226):

```go
// SetProfilePicture updates the user's profile picture file reference.
func (s *Service) SetProfilePicture(userID, fileID int64) error {
	_, err := s.db.Exec("UPDATE users SET profile_picture_id = ? WHERE id = ?", fileID, userID)
	return err
}

// ClearProfilePicture removes the user's profile picture.
func (s *Service) ClearProfilePicture(userID int64) (int64, error) {
	var fileID sql.NullInt64
	err := s.db.QueryRow("SELECT profile_picture_id FROM users WHERE id = ?", userID).Scan(&fileID)
	if err != nil {
		return 0, err
	}
	if !fileID.Valid {
		return 0, nil
	}
	_, err = s.db.Exec("UPDATE users SET profile_picture_id = NULL WHERE id = ?", userID)
	if err != nil {
		return 0, err
	}
	return fileID.Int64, nil
}

// GetProfilePictureFileID returns the user's current profile picture file ID (0 if none).
func (s *Service) GetProfilePictureFileID(userID int64) (int64, error) {
	var fileID sql.NullInt64
	err := s.db.QueryRow("SELECT profile_picture_id FROM users WHERE id = ?", userID).Scan(&fileID)
	if err != nil {
		return 0, err
	}
	if !fileID.Valid {
		return 0, nil
	}
	return fileID.Int64, nil
}
```

**Step 5: Verify**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add internal/db/migrations/016_avatar.sql internal/auth/auth.go
git commit -m "feat: add profile picture column and User struct avatar support"
```

---

### Task 2: Add avatar URL to Message struct and queries

**Files:**
- Modify: `internal/messages/messages.go`

The messages package already JOINs users to get `username` and `display_name`. We need to also select `profile_picture_id` and compute the avatar URL.

**Step 1: Add AvatarURL field to Message struct**

In `internal/messages/messages.go`, add to the Message struct (after line 37, the `IsBot` field):

```go
AvatarURL    string        `json:"avatarUrl,omitempty"`
```

**Step 2: Update GetByID query**

In `GetByID` (line 181-191), change the SELECT to include `u.profile_picture_id`:

```go
err := s.db.QueryRow(`
    SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at,
           m.edited_at, m.deleted_at,
           u.username, u.display_name, u.role, u.profile_picture_id,
           (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) as reply_count
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.id = ?
`, id)
```

Add `var avatarFileID sql.NullInt64` alongside the other nullable vars (line 175-180). Add `&avatarFileID` to the Scan call after `&role`, before `&m.ReplyCount`.

After `m.IsBot = role == "bot"` (line 198), add:
```go
if avatarFileID.Valid {
    m.AvatarURL = fmt.Sprintf("/api/files/%d", avatarFileID.Int64)
}
```

Add `"fmt"` to imports.

**Step 3: Update ListChannel query**

In `ListChannel` (lines 279-299), add `u.profile_picture_id` to both SELECT variants (with/without `before`). Add `var avatarFileID sql.NullInt64` inside the loop. Add `&avatarFileID` to both Scan calls after `&role`. After `m.IsBot = role == "bot"`, add the avatar URL logic.

**Step 4: Update ListThread query**

In `ListThread` (lines 347-365), same changes — add `u.profile_picture_id` to SELECT, scan it, set `m.AvatarURL`.

**Step 5: Verify**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add internal/messages/messages.go
git commit -m "feat: include avatar URL in message responses"
```

---

### Task 3: Add avatar upload/delete API endpoints

**Files:**
- Modify: `internal/api/api.go`

**Step 1: Register routes**

In `routes()` (after line 76, the account password route), add:

```go
h.mux.HandleFunc("PUT /api/account/avatar", h.handleUploadAvatar)
h.mux.HandleFunc("DELETE /api/account/avatar", h.handleDeleteAvatar)
```

**Step 2: Add handleUploadAvatar handler**

Add after `handleChangePassword` (after line ~302, find the end of that function):

```go
func (h *Handler) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("file field required"))
		return
	}
	defer file.Close()

	// Detect MIME type server-side
	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to read file"))
		return
	}
	mimeType := http.DetectContentType(buf[:n])
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to seek file"))
		return
	}

	if !files.IsImage(mimeType) {
		writeErr(w, http.StatusBadRequest, errors.New("file must be an image"))
		return
	}

	// Delete old avatar file if exists
	oldFileID, _ := h.auth.GetProfilePictureFileID(user.ID)
	if oldFileID > 0 {
		h.files.Delete(oldFileID)
	}

	f, err := h.files.Upload(user.ID, header.Filename, mimeType, header.Size, file)
	if errors.Is(err, files.ErrTooLarge) {
		writeErr(w, http.StatusRequestEntityTooLarge, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	if err := h.auth.SetProfilePicture(user.ID, f.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Return updated user
	updated, err := h.auth.GetUserByID(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) handleDeleteAvatar(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	fileID, err := h.auth.ClearProfilePicture(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if fileID > 0 {
		h.files.Delete(fileID)
	}

	// Return updated user
	updated, err := h.auth.GetUserByID(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}
```

**Step 3: Verify**

Run: `cd /home/dev/code/relay-chat && go build ./...`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: add avatar upload and delete API endpoints"
```

---

### Task 4: Frontend types and API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/stores/auth.svelte.ts`

**Step 1: Add avatarUrl to frontend types**

In `frontend/src/lib/types.ts`, add to the `User` interface (after line 6, `isBot`):

```typescript
avatarUrl?: string;
```

Add to the `Message` interface (after line 26, `isBot`):

```typescript
avatarUrl?: string;
```

**Step 2: Add avatar upload/delete functions to API client**

In `frontend/src/lib/api.ts`, add after the `uploadFile` function (after line 61):

```typescript
export async function uploadAvatar(file: globalThis.File): Promise<User> {
  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  const opts: RequestInit = { method: 'PUT', body: form, headers };

  if (isNative() && sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = 'include';
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/account/avatar`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as User;
}

export async function deleteAvatar(): Promise<User> {
  return api<User>('DELETE', '/api/account/avatar');
}
```

Add `User` to the type import:

```typescript
import type { FileAttachment, User } from './types';
```

**Step 3: Add avatar methods to auth store**

In `frontend/src/lib/stores/auth.svelte.ts`, add the import for the new functions. Change line 1 from:

```typescript
import { api, setSessionToken, getSessionToken } from '$lib/api';
```

To:

```typescript
import { api, setSessionToken, getSessionToken, uploadAvatar, deleteAvatar } from '$lib/api';
```

Add methods to the `AuthStore` class, before the closing `}` (before line 79):

```typescript
  async updateAvatar(file: File) {
    const updated = await uploadAvatar(file);
    this.user = updated;
  }

  async removeAvatar() {
    const updated = await deleteAvatar();
    this.user = updated;
  }
```

**Step 4: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/stores/auth.svelte.ts
git commit -m "feat: add avatar types, API functions, and auth store methods"
```

---

### Task 5: Create Avatar component

**Files:**
- Create: `frontend/src/lib/components/Avatar.svelte`

**Step 1: Create the component**

Create `frontend/src/lib/components/Avatar.svelte`:

```svelte
<script lang="ts">
  let {
    url,
    displayName,
    username,
    size = 36
  }: {
    url?: string;
    displayName: string;
    username?: string;
    size?: number;
  } = $props();

  // Generate a consistent color from the username/displayName
  function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `oklch(0.55 0.12 ${hue})`;
  }

  const initial = $derived(displayName.charAt(0).toUpperCase());
  const bgColor = $derived(hashColor(username || displayName));
  const fontSize = $derived(Math.round(size * 0.4));
</script>

{#if url}
  <img
    src={url}
    alt={displayName}
    class="rounded-full object-cover shrink-0"
    style="width: {size}px; height: {size}px;"
  />
{:else}
  <div
    class="rounded-full shrink-0 flex items-center justify-center font-bold select-none"
    style="width: {size}px; height: {size}px; background: {bgColor}; color: oklch(0.95 0 0); font-size: {fontSize}px;"
  >
    {initial}
  </div>
{/if}
```

**Step 2: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/lib/components/Avatar.svelte
git commit -m "feat: add Avatar component with image and initial fallback"
```

---

### Task 6: Update Message.svelte with avatar display

**Files:**
- Modify: `frontend/src/lib/components/Message.svelte`

**Step 1: Import Avatar component**

In `Message.svelte`, add import (after line 10, the FilePreview import):

```typescript
import Avatar from './Avatar.svelte';
```

**Step 2: Rewrite the header to include avatar**

Replace the header section (lines 225-243) from:

```svelte
{#if !grouped}
    <!-- Header: timestamp + author -->
    <div class="flex items-baseline gap-2 pt-1">
      <span
        class="text-[11px] tabular-nums shrink-0 select-none w-9"
        style="color: var(--rc-timestamp);"
      >{formatTime(message.createdAt)}</span>
      <span class="text-[13px] font-bold" style="color: var(--foreground);">
        {message.displayName}
      </span>
      {#if message.isBot}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1 py-[1px]"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
      {/if}
      {#if message.editedAt}
        <span class="text-[10px] italic" style="color: var(--rc-timestamp);">(edited)</span>
      {/if}
    </div>
  {/if}
```

With:

```svelte
{#if !grouped}
    <!-- Header: avatar + timestamp + author -->
    <div class="flex items-center gap-2 pt-1">
      <span
        class="text-[11px] tabular-nums shrink-0 select-none w-9 self-baseline"
        style="color: var(--rc-timestamp);"
      >{formatTime(message.createdAt)}</span>
      <Avatar url={message.avatarUrl} displayName={message.displayName} username={message.username} size={compact ? 28 : 36} />
      <div class="flex items-baseline gap-1.5 min-w-0">
        <span class="text-[13px] font-bold truncate" style="color: var(--foreground);">
          {message.displayName}
        </span>
        {#if message.isBot}
          <span class="text-[9px] font-bold uppercase tracking-wide px-1 py-[1px] shrink-0"
                style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
        {/if}
        {#if message.editedAt}
          <span class="text-[10px] italic shrink-0" style="color: var(--rc-timestamp);">(edited)</span>
        {/if}
      </div>
    </div>
  {/if}
```

**Step 3: Update body padding to account for avatar width**

The body content (line 293-295) currently has `padding-left: 52px` (for non-compact) to align with the author name after the timestamp. With the avatar (36px + gap), we need more padding. Change:

```svelte
style="color: var(--foreground); padding-left: {compact ? '44px' : '52px'}; ...
```

To:

```svelte
style="color: var(--foreground); padding-left: {compact ? '76px' : '92px'}; ...
```

The math: timestamp (36px=w-9) + gap (8px) + avatar (36px) + gap (8px) + small offset = ~92px for non-compact, ~76px for compact (28px avatar).

**Step 4: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add frontend/src/lib/components/Message.svelte
git commit -m "feat: display avatar in message header with Slack-style layout"
```

---

### Task 7: Add avatar upload to settings page

**Files:**
- Modify: `frontend/src/routes/(app)/settings/+page.svelte`

**Step 1: Add imports and state variables**

Add Avatar import at the top of the script (after line 9):

```typescript
import Avatar from '$lib/components/Avatar.svelte';
```

Add state variables (after line 17, `changingPassword`):

```typescript
// --- Avatar ---
let uploadingAvatar = $state(false);
let avatarMessage = $state('');
let avatarError = $state('');
```

**Step 2: Add avatar handler functions**

Add after the `changePassword` function (after line 140):

```typescript
// --- Avatar ---
async function handleAvatarUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    avatarError = 'Image must be less than 5MB';
    autoHide((v) => (avatarError = v));
    return;
  }
  uploadingAvatar = true;
  avatarError = '';
  avatarMessage = '';
  try {
    await authStore.updateAvatar(file);
    avatarMessage = 'Profile picture updated';
    input.value = '';
    autoHide((v) => (avatarMessage = v));
  } catch (err: unknown) {
    avatarError = err instanceof Error ? err.message : 'Failed to upload';
    autoHide((v) => (avatarError = v));
  } finally {
    uploadingAvatar = false;
  }
}

async function handleAvatarRemove() {
  try {
    await authStore.removeAvatar();
    avatarMessage = 'Profile picture removed';
    autoHide((v) => (avatarMessage = v));
  } catch (err: unknown) {
    avatarError = err instanceof Error ? err.message : 'Failed to remove';
    autoHide((v) => (avatarError = v));
  }
}
```

**Step 3: Add avatar UI to account section**

In the account section, insert after the display name row (after line 362, the display name `</div>`) and before the logout button (line 364):

```svelte
        </div>
        <!-- Profile Picture -->
        <div class="flex items-center gap-3 mt-3">
          <Avatar url={authStore.user?.avatarUrl} displayName={authStore.user?.displayName || '?'} username={authStore.user?.username} size={48} />
          <div class="flex flex-col gap-1">
            <label class="text-[11px] hover:underline underline-offset-2 cursor-pointer" style="color: var(--rc-olive);">
              {uploadingAvatar ? 'uploading...' : 'change picture'}
              <input type="file" accept="image/*" onchange={handleAvatarUpload} disabled={uploadingAvatar} class="hidden" />
            </label>
            {#if authStore.user?.avatarUrl}
              <button onclick={handleAvatarRemove} class="text-[11px] text-left hover:underline underline-offset-2"
                      style="color: var(--rc-mention-badge);">remove</button>
            {/if}
          </div>
        </div>
        {#if avatarMessage}<p class="text-[11px] mt-2" style="color: var(--rc-olive);">{avatarMessage}</p>{/if}
        {#if avatarError}<p class="text-[11px] mt-2" style="color: var(--rc-mention-badge);">{avatarError}</p>{/if}
```

**Step 4: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add frontend/src/routes/(app)/settings/+page.svelte
git commit -m "feat: add profile picture upload to settings page"
```

---

### Task 8: Full build and E2E verification

**Step 1: Full build**

Run: `make build`
Expected: Frontend builds, Go binary compiles, no errors.

**Step 2: Run Go tests**

Run: `make test`
Expected: All tests pass (migration applies cleanly to test DBs).

**Step 3: Run E2E tests**

Run: `make test-e2e`
Expected: All tests pass. The avatar changes shouldn't break existing tests since:
- Messages still render with same CSS classes
- Avatar is additive (shows in ungrouped messages alongside existing elements)
- Settings page adds UI but doesn't move existing elements

**Step 4: Commit any fixes**

If tests fail, fix and commit.
