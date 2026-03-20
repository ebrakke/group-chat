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

### 2. Improve hover tooltip

The component already has a native `title` attribute ("Notifications: mentions"). Update the `title` text and `aria-label` to use clearer labels:

| Level | Label |
|-------|-------|
| `everything` | "All messages" |
| `mentions` | "Mentions only" |
| `threads` | "Thread replies" |
| `nothing` | "Muted" |

Keep using the native `title` attribute — no custom CSS tooltip needed. The existing approach works and is accessible. Just make the label text more descriptive.

## Scope

- `NotificationBell.svelte` — replace icons, add tooltip
- `package.json` — add `lucide-svelte`
- No other components change. Migrating other inline SVGs to Lucide is out of scope.
