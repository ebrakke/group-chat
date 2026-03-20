# Notification Bell UX Improvement

## Problem

The notification bell icons are confusing. Four levels use variations of bell SVGs that are hard to distinguish, especially `mentions` (plain bell) vs `everything` (bell with signal waves). Users mistake `mentions` for "all messages" and don't receive expected notifications.

## Changes

### 1. Replace inline SVGs with Lucide icons

Install `lucide-svelte` and swap the 4 inline SVGs in `NotificationBell.svelte`:

| Level | Lucide Icon | Tooltip |
|-------|-------------|---------|
| `everything` | `BellRing` | "All messages" |
| `mentions` | `AtSign` | "Mentions only" |
| `threads` | `MessageSquare` | "Thread replies" |
| `nothing` | `BellOff` | "Muted" |

Using `AtSign` for mentions makes the mode instantly recognizable. Four visually distinct icons eliminate ambiguity.

### 2. Add hover tooltip showing current state

CSS-only tooltip (positioned `<span>`, visible on hover) displaying the current level in plain English. Styled with existing theme variables (`--foreground`, `--background`, `--border`). No tooltip library.

## Scope

- `NotificationBell.svelte` — replace icons, add tooltip
- `package.json` — add `lucide-svelte`
- No other components change. Migrating other inline SVGs to Lucide is out of scope.
