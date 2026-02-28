# Theme System Design

**Goal:** Themeable CSS variable system with pre-bundled themes, a settings UI picker, and a Claude skill for generating custom themes.

## Architecture

Themes are CSS `[data-theme="name"]` selector blocks in `app.css` that override the 16 `:root` variables. The frontend stores the user's choice in `localStorage.theme` and applies `data-theme` to `<html>`.

## Components

1. **app.css** — `:root` holds parchment (default). Each additional theme is a `[data-theme="name"]` block overriding all variables. `html, body` background uses `var(--background)`.

2. **theme.svelte.ts** — Store that reads `localStorage.theme` on init, exposes `currentTheme` and `setTheme(name)`. Setting a theme updates localStorage and `document.documentElement.dataset.theme`.

3. **+layout.svelte** — Calls `themeStore` init on mount so theme is applied before paint.

4. **Settings page** — "Theme" section with visual swatches showing each theme's colors. Clicking a swatch applies it immediately.

5. **Claude skill** — `.claude/skills/create-theme.md` instructs Claude to ask for a vibe, generate the CSS variable block, and add it to `app.css`.

## Pre-bundled Themes

- **Parchment** (default) — current warm cream/sepia
- **Terminal** — black background, green text, hacker aesthetic, `color-scheme: dark`

## Storage

localStorage only. No backend changes. Per-device preference.

## CSS Variables (all 16)

```
--background, --foreground, --border
--rc-sidebar-bg, --rc-channel-active-bg, --rc-channel-active-fg
--rc-message-hover, --rc-timestamp, --rc-link
--rc-mention-badge, --rc-mention-bg, --rc-thread-bg
--rc-olive, --rc-divider-label, --rc-muted, --rc-muted-fg
--rc-destructive, --rc-input-bg
```
