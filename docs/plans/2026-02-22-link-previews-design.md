# Link Previews Design

## Problem

1. **Links are broken**: The `renderer.link` override in `frontend/src/markdown.js` uses the old marked v4 API signature `(href, title, text)`. Marked v17 passes a single token object `({href, title, tokens})`, so links silently fail to render — URLs show as plain text.
2. **No link previews**: When someone shares a URL, there's no visual preview. Users want Slack-style Open Graph cards showing title, description, and image.

## Solution

### Part 1: Fix broken link rendering

Update the `renderer.link` override in `markdown.js` to use the marked v17 API. The new signature receives a single object with `href`, `title`, and `tokens` properties. This fix alone restores blue, clickable links.

### Part 2: Server-side OG metadata fetching

When a message is created (`Create` / `CreateReply`), the server:

1. Extracts URLs from message content via regex (`https?://\S+`)
2. Fetches OG metadata for up to 3 URLs per message (3-second timeout each)
3. Parses `og:title`, `og:description`, `og:image`, `og:site_name` from the HTML `<head>`
4. Stores results as JSON in a new `link_previews` column on the messages table
5. Returns previews in API responses and WebSocket broadcasts

If a fetch fails or times out, that URL gets no preview — message still sends normally.

### Part 3: Database migration

New migration `011_link_previews.sql`:

```sql
ALTER TABLE messages ADD COLUMN link_previews TEXT;
```

Nullable, no default. Existing messages have `NULL`. Same pattern as the `mentions` column (migration 009).

**Go structs:**

```go
type LinkPreview struct {
    URL         string `json:"url"`
    Title       string `json:"title,omitempty"`
    Description string `json:"description,omitempty"`
    Image       string `json:"image,omitempty"`
    SiteName    string `json:"siteName,omitempty"`
}
```

Message struct gets: `LinkPreviews []LinkPreview json:"linkPreviews,omitempty"`

JSON stored in DB:

```json
[
  {
    "url": "https://example.com/article",
    "title": "Article Title",
    "description": "A short description...",
    "image": "https://example.com/og-image.jpg",
    "site_name": "Example"
  }
]
```

### Part 4: Frontend preview cards

Below `.msg-body`, render a card for each preview in `linkPreviews`:

```
+----------------------------------+
| X                                |  <- dismiss button (top-right)
|  site_name                       |
|  Title (bold, linked)            |
|  Description (2 lines max, gray) |
|                    +--------+    |
|                    |  image |    |
|                    +--------+    |
+----------------------------------+
```

Styling:
- Left border accent in `#30363d`
- Dark card background `#161b22`
- Title is a clickable link (opens in new tab)
- Image as right-aligned thumbnail, max ~80px tall
- Description truncated to 2 lines with CSS `line-clamp`
- Dismiss button: client-side only (toggles `display: none`, does not persist)
- Skip previews where no title was fetched

## Decisions

- **Approach A (JSON column)** chosen over separate table — follows existing `mentions` pattern, simpler for a small group chat
- **Synchronous fetch** on message create — acceptable latency for small group chat, avoids async complexity
- **Max 3 previews per message** — prevents abuse
- **3-second timeout per fetch** — keeps message creation responsive
- **Client-side dismiss only** — avoids extra API/DB work for a simple UX feature
