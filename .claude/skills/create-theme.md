---
name: create-theme
description: Create a custom theme for Relay Chat. Use when the user wants a new color scheme or theme.
---

# Create Custom Theme

You are creating a custom theme for Relay Chat. The theme system uses CSS custom properties with oklch color values.

## Process

1. Ask the user to describe the vibe/aesthetic they want (e.g., "ocean blue", "sunset warm", "cyberpunk neon")
2. Generate appropriate oklch color values for all 16 CSS variables
3. Add the theme as a new `[data-theme="name"]` block in `frontend/src/app.css`
4. Register it in `frontend/src/lib/stores/theme.svelte.ts` by adding to the `ThemeId` type union and `THEMES` array

## CSS Variables to Define

Every theme MUST define all of these variables:

```css
[data-theme="your-theme-name"] {
  color-scheme: light; /* or dark */

  /* Base */
  --background:          /* main background */
  --foreground:          /* primary text */
  --border:              /* borders, dividers */

  /* Sidebar */
  --rc-sidebar-bg:       /* sidebar background (slightly different from main) */
  --rc-channel-active-bg: /* selected channel background */
  --rc-channel-active-fg: /* selected channel text */

  /* Messages */
  --rc-message-hover:    /* message hover background */
  --rc-timestamp:        /* timestamps, secondary text, muted UI */
  --rc-link:             /* hyperlink color */

  /* Alerts & mentions */
  --rc-mention-badge:    /* unread badge, error color */
  --rc-mention-bg:       /* mention highlight background (use alpha) */

  /* Thread */
  --rc-thread-bg:        /* thread panel background */

  /* Accents */
  --rc-olive:            /* success, positive actions, reply counts */
  --rc-divider-label:    /* date divider labels */

  /* Form elements */
  --rc-muted:            /* muted/inactive backgrounds */
  --rc-muted-fg:         /* muted/inactive text */
  --rc-destructive:      /* delete buttons, dangerous actions */
  --rc-input-bg:         /* input field backgrounds */
}
```

## Color Guidelines

- Use oklch color space: `oklch(lightness chroma hue)` or `oklch(L C H / alpha)`
- Lightness: 0 (black) to 1 (white)
- Chroma: 0 (gray) to ~0.4 (most saturated)
- Hue: 0-360 degrees (0=red, 120=green, 240=blue)
- For dark themes: background L ~0.10-0.20, foreground L ~0.80-0.95
- For light themes: background L ~0.90-0.97, foreground L ~0.15-0.25
- Ensure sufficient contrast between foreground/background (min 4.5:1)
- `--rc-sidebar-bg` should be slightly different from `--background`
- `--rc-message-hover` should be slightly different from `--background`
- `--rc-input-bg` should be slightly different from `--background`
- `--rc-mention-badge` and `--rc-destructive` should be attention-grabbing

## Registration

After adding the CSS block, update `frontend/src/lib/stores/theme.svelte.ts`:

1. Add the new name to the `ThemeId` type: `export type ThemeId = 'parchment' | 'terminal' | 'your-name';`
2. Add an entry to the `THEMES` array with `id`, `name`, and `colors` (bg, fg, accent for the swatch preview)

## Verification

Run `cd frontend && bun run build` to verify the build succeeds after changes.
