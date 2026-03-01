# Profile Card Design

**Goal:** Clickable profile popover card showing user info when clicking avatar/name in messages.

## Architecture

A `ProfileCard.svelte` popover component renders as a fixed-position card anchored near the clicked avatar or display name. Message data already includes userId, displayName, username, avatarUrl, isBot. We add `role` and `userCreatedAt` to the message response so the card needs no extra API call.

## Components

1. **Message struct** — Add `Role` and `UserCreatedAt` fields to Go Message struct and corresponding SQL queries. Add `role` and `userCreatedAt` to frontend Message type.

2. **ProfileCard.svelte** — Popover card (~250px wide). Shows large avatar (80px), display name, @username, role badge (if admin), "member since {month year}". Fixed position, click-outside to dismiss.

3. **Message.svelte** — Clicking avatar or display name opens profile card. `e.stopPropagation()` prevents thread-open. Pass click coordinates to position the popover.

## Positioning

- Use `getBoundingClientRect()` on the clicked element
- Render below by default, flip above if near bottom of viewport
- Clamp horizontal position to stay on screen
- Same fixed-position pattern as the emoji picker

## Data Flow

Messages already carry user info via the `JOIN users` query. Adding `u.role` and `u.created_at` (as `userCreatedAt`) to the existing SELECT requires no new API endpoint.
