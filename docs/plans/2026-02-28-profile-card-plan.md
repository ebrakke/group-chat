# Profile Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a clickable profile popover card that shows user info when clicking an avatar or display name in chat messages.

**Architecture:** Add `role` and `userCreatedAt` fields to the Message struct so the profile card needs no extra API call. Create a ProfileCard.svelte popover component. Wire click handlers on avatar/name in Message.svelte to open the card.

**Tech Stack:** Go, SQLite, Svelte 5 runes, Tailwind v4

---

### Task 1: Add role and userCreatedAt to Message struct and queries

**Files:**
- Modify: `internal/messages/messages.go`
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add fields to Go Message struct**

In `internal/messages/messages.go`, add two fields to the Message struct (after `AvatarURL`, line 38):

```go
Role         string        `json:"role,omitempty"`
UserCreatedAt string       `json:"userCreatedAt,omitempty"`
```

**Step 2: Update GetByID query**

The SELECT already includes `u.role`. Add `u.created_at` as `user_created_at` after `u.profile_picture_id` (line 186):

Change line 186 from:
```sql
u.username, u.display_name, u.role, u.profile_picture_id,
```
To:
```sql
u.username, u.display_name, u.role, u.profile_picture_id, u.created_at,
```

Add `var userCreatedAt string` and add `&userCreatedAt` to the Scan call (after `&avatarFileID`, before `&m.ReplyCount`).

After `m.IsBot = role == "bot"` and the avatar URL block, add:
```go
m.Role = role
m.UserCreatedAt = userCreatedAt
```

**Step 3: Update ListChannel query**

Both SELECT branches (lines 285-287 and 296-298) — add `u.created_at` after `u.profile_picture_id`. Inside the loop, add `var userCreatedAt string`, scan it (after `&avatarFileID`, before `&m.ReplyCount`). Set `m.Role = role` and `m.UserCreatedAt = userCreatedAt`.

**Step 4: Update ListThread query**

Both SELECT branches (lines 357-359 and 367-369) — add `u.created_at` after `u.profile_picture_id`. Inside the loop, add `var userCreatedAt string`, scan it (after `&avatarFileID`). Set `m.Role = role` and `m.UserCreatedAt = userCreatedAt`.

**Step 5: Update frontend Message type**

In `frontend/src/lib/types.ts`, add to the Message interface (after `avatarUrl`):

```typescript
role?: string;
userCreatedAt?: string;
```

**Step 6: Verify**

Run: `cd /home/dev/code/relay-chat && go build ./... && cd frontend && bun run build`
Expected: Both builds succeed.

**Step 7: Commit**

```bash
git add internal/messages/messages.go frontend/src/lib/types.ts
git commit -m "feat: include user role and created_at in message responses"
```

---

### Task 2: Create ProfileCard component

**Files:**
- Create: `frontend/src/lib/components/ProfileCard.svelte`

**Step 1: Create the component**

Create `frontend/src/lib/components/ProfileCard.svelte`:

```svelte
<script lang="ts">
  import Avatar from './Avatar.svelte';

  let {
    displayName,
    username,
    avatarUrl,
    role,
    userCreatedAt,
    isBot = false,
    anchorRect,
    onClose
  }: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
    userCreatedAt?: string;
    isBot?: boolean;
    anchorRect: DOMRect;
    onClose: () => void;
  } = $props();

  // Position: below anchor by default, flip above if near bottom
  const cardHeight = 200;
  const cardWidth = 250;

  let style = $derived(() => {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const above = spaceBelow < cardHeight + 10 && anchorRect.top > cardHeight + 10;
    const top = above ? anchorRect.top - cardHeight - 4 : anchorRect.bottom + 4;
    const left = Math.min(anchorRect.left, window.innerWidth - cardWidth - 8);
    return `top: ${top}px; left: ${Math.max(8, left)}px; width: ${cardWidth}px;`;
  });

  function formatJoinDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  function handleClickOutside(e: MouseEvent) {
    onClose();
  }

  $effect(() => {
    // Use setTimeout to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="profile-card fixed z-50 border p-4"
  style="background: var(--background); border-color: var(--border); {style()}"
  onclick={(e) => e.stopPropagation()}
>
  <div class="flex flex-col items-center text-center gap-2">
    <Avatar url={avatarUrl} displayName={displayName} username={username} size={80} />
    <div>
      <div class="text-[14px] font-bold" style="color: var(--foreground);">{displayName}</div>
      {#if username}
        <div class="text-[12px]" style="color: var(--rc-timestamp);">@{username}</div>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if isBot}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px]"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
      {/if}
      {#if role === 'admin'}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px]"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">ADMIN</span>
      {/if}
    </div>
    {#if userCreatedAt}
      <div class="text-[11px]" style="color: var(--rc-timestamp);">
        member since {formatJoinDate(userCreatedAt)}
      </div>
    {/if}
  </div>
</div>
```

**Step 2: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/lib/components/ProfileCard.svelte
git commit -m "feat: add ProfileCard popover component"
```

---

### Task 3: Wire profile card into Message.svelte

**Files:**
- Modify: `frontend/src/lib/components/Message.svelte`

**Step 1: Import ProfileCard**

Add after the Avatar import (line 11):

```typescript
import ProfileCard from './ProfileCard.svelte';
```

**Step 2: Add state for profile card**

Add after the `touchTimer` variable (line 35):

```typescript
let showProfileCard = $state(false);
let profileCardAnchorRect: DOMRect | null = $state(null);
```

**Step 3: Add click handler for avatar/name**

Add after the `handleEditKeydown` function (after line 211):

```typescript
function handleProfileClick(e: MouseEvent) {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  profileCardAnchorRect = target.getBoundingClientRect();
  showProfileCard = true;
}
```

**Step 4: Make avatar and display name clickable**

In the header section (lines 226-247), wrap the Avatar and display name in clickable elements. Replace the Avatar line (line 233):

```svelte
<Avatar url={message.avatarUrl} displayName={message.displayName} username={message.username} size={compact ? 28 : 36} />
```

With:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="cursor-pointer" onclick={handleProfileClick}>
  <Avatar url={message.avatarUrl} displayName={message.displayName} username={message.username} size={compact ? 28 : 36} />
</span>
```

Replace the display name span (lines 235-237):

```svelte
<span class="text-[13px] font-bold truncate" style="color: var(--foreground);">
  {message.displayName}
</span>
```

With:

```svelte
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="text-[13px] font-bold truncate cursor-pointer hover:underline underline-offset-2" style="color: var(--foreground);"
      onclick={handleProfileClick}>
  {message.displayName}
</span>
```

**Step 5: Render ProfileCard**

Add at the very end of the file, before the closing bottom sheet block (before `{#if showBottomSheet}`, around line 400):

```svelte
<!-- Profile Card -->
{#if showProfileCard && profileCardAnchorRect}
  <ProfileCard
    displayName={message.displayName}
    username={message.username}
    avatarUrl={message.avatarUrl}
    role={message.role}
    userCreatedAt={message.userCreatedAt}
    isBot={message.isBot}
    anchorRect={profileCardAnchorRect}
    onClose={() => (showProfileCard = false)}
  />
{/if}
```

**Step 6: Verify**

Run: `cd frontend && bun run build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/lib/components/Message.svelte
git commit -m "feat: wire profile card to avatar and display name clicks"
```

---

### Task 4: Full build and E2E verification

**Step 1: Full build**

Run: `make build`
Expected: No errors.

**Step 2: Run Go tests**

Run: `make test`
Expected: All tests pass.

**Step 3: Run E2E tests**

Run: `make test-e2e`
Expected: All tests pass. The profile card is additive — clicking avatar/name opens the card but existing click-to-open-thread on the message body still works (the avatar/name clicks use `stopPropagation`).

**Step 4: Commit any fixes if needed**
