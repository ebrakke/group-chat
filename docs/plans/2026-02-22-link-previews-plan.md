# Link Previews Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken hyperlinks in chat and add Slack-style Open Graph link preview cards.

**Architecture:** Two independent fixes: (1) update the `renderer.link` override in `frontend/src/markdown.js` to use marked v17's new API signature, (2) add server-side OG metadata fetching on message create, store as JSON column on messages table, render as dismissable preview cards on the frontend.

**Tech Stack:** Go (backend OG fetcher using `net/http` + `golang.org/x/net/html`), SQLite (new migration), vanilla JS + CSS (frontend cards)

---

### Task 1: Fix the marked v17 renderer.link override

**Files:**
- Modify: `frontend/src/markdown.js:16-20`

**Step 1: Update the renderer.link override to use the new API**

The current code uses the old marked v4 signature `(href, title, text)`. Marked v17 passes a single token object. Replace the override:

```javascript
// Override link rendering to add security attributes
const originalLink = renderer.link.bind(renderer);
renderer.link = function(token) {
  const html = originalLink(token);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};
```

**Step 2: Build frontend and verify**

Run:
```bash
cd frontend && bun run build
```
Expected: Build succeeds without errors.

**Step 3: Commit**

```bash
git add frontend/src/markdown.js
git commit -m "fix: update renderer.link to marked v17 API signature"
```

---

### Task 2: Add database migration for link_previews column

**Files:**
- Create: `internal/db/migrations/011_link_previews.sql`

**Step 1: Create the migration file**

```sql
-- Add link_previews column to messages table for OG metadata storage
ALTER TABLE messages ADD COLUMN link_previews TEXT; -- JSON array of link preview objects
```

**Step 2: Verify migration applies**

Run:
```bash
go test ./internal/db/ -v -run TestMigrations
```

If no migration-specific test exists, verify the app starts cleanly:
```bash
go build -o relay-chat ./cmd/app/ && echo "Build OK"
```
Expected: Builds successfully.

**Step 3: Commit**

```bash
git add internal/db/migrations/011_link_previews.sql
git commit -m "feat: add link_previews column migration"
```

---

### Task 3: Add LinkPreview struct and URL extraction

**Files:**
- Modify: `internal/messages/messages.go:18-35`

**Step 1: Write the test for URL extraction**

Add to `internal/messages/messages_test.go`:

```go
func TestExtractURLs(t *testing.T) {
	tests := []struct {
		content string
		want    []string
	}{
		{"no links here", nil},
		{"check https://example.com out", []string{"https://example.com"}},
		{"http://a.com and https://b.com/path?q=1", []string{"http://a.com", "https://b.com/path?q=1"}},
		{"https://a.com https://b.com https://c.com https://d.com", []string{"https://a.com", "https://b.com", "https://c.com"}}, // max 3
		{"no trailing punc https://example.com.", []string{"https://example.com"}},
		{"parens (https://example.com)", []string{"https://example.com"}},
	}
	for _, tt := range tests {
		got := extractURLs(tt.content)
		if len(got) != len(tt.want) {
			t.Errorf("extractURLs(%q) = %v, want %v", tt.content, got, tt.want)
			continue
		}
		for i := range got {
			if got[i] != tt.want[i] {
				t.Errorf("extractURLs(%q)[%d] = %q, want %q", tt.content, i, got[i], tt.want[i])
			}
		}
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/messages/ -v -run TestExtractURLs`
Expected: FAIL — `extractURLs` undefined.

**Step 3: Add the LinkPreview struct, URL regex, and extractURLs function**

In `internal/messages/messages.go`, add after line 18 (`var mentionRe = ...`):

```go
var urlRe = regexp.MustCompile(`https?://[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'")\]}]`)

const maxPreviews = 3
```

Add the `LinkPreview` struct after the `Message` struct (after line 35):

```go
type LinkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"siteName,omitempty"`
}
```

Add `LinkPreviews` field to the `Message` struct (after line 34, the `Mentions` field):

```go
	LinkPreviews []LinkPreview `json:"linkPreviews,omitempty"`
```

Add the `extractURLs` function (after `extractMentions`):

```go
// extractURLs finds up to maxPreviews URLs in message content.
func extractURLs(content string) []string {
	matches := urlRe.FindAllString(content, maxPreviews)
	if len(matches) == 0 {
		return nil
	}
	return matches
}
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/messages/ -v -run TestExtractURLs`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/messages/messages.go internal/messages/messages_test.go
git commit -m "feat: add LinkPreview struct and URL extraction"
```

---

### Task 4: Add OG metadata fetcher

**Files:**
- Create: `internal/messages/ogfetch.go`

**Step 1: Write the test**

Create `internal/messages/ogfetch_test.go`:

```go
package messages

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchOGMetadata(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<html><head>
			<meta property="og:title" content="Test Title">
			<meta property="og:description" content="Test Description">
			<meta property="og:image" content="https://example.com/img.jpg">
			<meta property="og:site_name" content="Example">
		</head><body></body></html>`))
	}))
	defer ts.Close()

	lp := fetchOGMetadata(ts.URL)
	if lp == nil {
		t.Fatal("expected non-nil LinkPreview")
	}
	if lp.Title != "Test Title" {
		t.Errorf("title = %q, want %q", lp.Title, "Test Title")
	}
	if lp.Description != "Test Description" {
		t.Errorf("description = %q", lp.Description)
	}
	if lp.Image != "https://example.com/img.jpg" {
		t.Errorf("image = %q", lp.Image)
	}
	if lp.SiteName != "Example" {
		t.Errorf("siteName = %q", lp.SiteName)
	}
}

func TestFetchOGMetadataNoTitle(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html><body>no og tags</body></html>`))
	}))
	defer ts.Close()

	lp := fetchOGMetadata(ts.URL)
	if lp != nil {
		t.Errorf("expected nil for page with no OG title, got %+v", lp)
	}
}

func TestFetchOGMetadataTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {} // hang forever
	}))
	defer ts.Close()

	// Should return nil (timeout), not block forever
	lp := fetchOGMetadata(ts.URL)
	if lp != nil {
		t.Errorf("expected nil on timeout, got %+v", lp)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/messages/ -v -run TestFetchOG`
Expected: FAIL — `fetchOGMetadata` undefined.

**Step 3: Implement fetchOGMetadata**

Create `internal/messages/ogfetch.go`:

```go
package messages

import (
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"
)

var ogClient = &http.Client{Timeout: 3 * time.Second}

// fetchOGMetadata fetches a URL and extracts Open Graph metadata.
// Returns nil if the fetch fails or no og:title is found.
func fetchOGMetadata(rawURL string) *LinkPreview {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "RelayChat/1.0 (link preview)")

	resp, err := ogClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "text/html") && !strings.HasPrefix(ct, "application/xhtml") {
		return nil
	}

	// Limit read to 256KB to avoid downloading huge pages
	body := io.LimitReader(resp.Body, 256*1024)
	return parseOGTags(body)
}

// parseOGTags parses OG meta tags from an HTML reader.
func parseOGTags(r io.Reader) *LinkPreview {
	tokenizer := html.NewTokenizer(r)
	var lp LinkPreview

	for {
		tt := tokenizer.Next()
		switch tt {
		case html.ErrorToken:
			if lp.Title == "" {
				return nil
			}
			return &lp
		case html.StartTagToken, html.SelfClosingTagToken:
			tn, hasAttr := tokenizer.TagName()
			tagName := string(tn)

			// Stop parsing once we hit <body>
			if tagName == "body" {
				if lp.Title == "" {
					return nil
				}
				return &lp
			}

			if tagName != "meta" || !hasAttr {
				continue
			}

			var property, content string
			for {
				key, val, more := tokenizer.TagAttr()
				k := string(key)
				v := string(val)
				if k == "property" {
					property = v
				} else if k == "content" {
					content = v
				}
				if !more {
					break
				}
			}

			switch property {
			case "og:title":
				lp.Title = content
			case "og:description":
				lp.Description = content
			case "og:image":
				lp.Image = content
			case "og:site_name":
				lp.SiteName = content
			}
		}
	}
}
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/messages/ -v -run TestFetchOG`
Expected: PASS

**Step 5: Commit**

```bash
git add internal/messages/ogfetch.go internal/messages/ogfetch_test.go
git commit -m "feat: add OG metadata fetcher with HTML parser"
```

---

### Task 5: Integrate link previews into message creation and queries

**Files:**
- Modify: `internal/messages/messages.go` (Create, CreateReply, GetByID, ListChannel, ListThread)

**Step 1: Write the test**

Add to `internal/messages/messages_test.go`:

```go
func TestMessageLinkPreviews(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Message with no URLs — linkPreviews should be nil
	msg, err := svc.Create(1, 1, "no links here", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if msg.LinkPreviews != nil {
		t.Errorf("expected nil linkPreviews, got %v", msg.LinkPreviews)
	}

	// Verify link_previews column is readable (NULL case)
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.LinkPreviews != nil {
		t.Errorf("expected nil linkPreviews from GetByID, got %v", got.LinkPreviews)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/messages/ -v -run TestMessageLinkPreviews`
Expected: FAIL — Scan expects wrong number of columns (link_previews not yet read).

**Step 3: Update Create and CreateReply to extract URLs, fetch OG, and store previews**

In `Create` method (after extracting mentions, before the INSERT):

```go
	// Extract URLs and fetch OG metadata
	previews := fetchLinkPreviews(content)
	var previewsJSON []byte
	if len(previews) > 0 {
		previewsJSON, _ = json.Marshal(previews)
	}
```

Update the INSERT to include `link_previews`:

```go
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, content, event_id, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		channelID, userID, content, eventID, mentionsJSON, previewsJSON, now,
	)
```

Do the same in `CreateReply` — add the same preview extraction block and update its INSERT:

```go
	res, err := s.db.Exec(
		"INSERT INTO messages (channel_id, user_id, parent_id, content, event_id, mentions, link_previews, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		parent.ChannelID, userID, parentID, content, eventID, mentionsJSON, previewsJSON, now,
	)
```

Add the `fetchLinkPreviews` helper (near `extractMentions`):

```go
// fetchLinkPreviews extracts URLs and fetches OG metadata for each.
func fetchLinkPreviews(content string) []LinkPreview {
	urls := extractURLs(content)
	if len(urls) == 0 {
		return nil
	}
	var previews []LinkPreview
	for _, u := range urls {
		lp := fetchOGMetadata(u)
		if lp != nil {
			lp.URL = u
			previews = append(previews, *lp)
		}
	}
	return previews
}
```

**Step 4: Update GetByID to read link_previews column**

Add a `var previewsJSON sql.NullString` variable and include `m.link_previews` in the SELECT and Scan:

```go
func (s *Service) GetByID(id int64) (*Message, error) {
	var m Message
	var parentID sql.NullInt64
	var eventID sql.NullString
	var previewsJSON sql.NullString
	var role string
	err := s.db.QueryRow(`
		SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at,
		       u.username, u.display_name, u.role,
		       (SELECT COUNT(*) FROM messages r WHERE r.parent_id = m.id) as reply_count
		FROM messages m
		JOIN users u ON m.user_id = u.id
		WHERE m.id = ?
	`, id).Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
		&m.Username, &m.DisplayName, &role, &m.ReplyCount)
```

After existing field processing, add:

```go
	if previewsJSON.Valid {
		json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
	}
```

**Step 5: Update ListChannel to read link_previews column**

Add `m.link_previews` to both SELECT queries (with and without `before`), add `var previewsJSON sql.NullString` in the scan loop, add it to Scan args, and unmarshal after scanning:

In the SELECT (both branches), add `m.link_previews` after `m.event_id`:
```sql
SELECT m.id, m.channel_id, m.user_id, m.content, m.event_id, m.link_previews, m.created_at, ...
```

In the scan loop:
```go
	var previewsJSON sql.NullString
	if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
		&m.Username, &m.DisplayName, &role, &m.ReplyCount); err != nil {
```

After existing field processing:
```go
	if previewsJSON.Valid {
		json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
	}
```

**Step 6: Update ListThread to read link_previews column**

Same pattern — add `m.link_previews` to both SELECT queries, add scan variable, add to Scan args, unmarshal after:

```sql
SELECT m.id, m.channel_id, m.user_id, m.parent_id, m.content, m.event_id, m.link_previews, m.created_at, ...
```

```go
	var previewsJSON sql.NullString
	if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &parentID, &m.Content, &eventID, &previewsJSON, &m.CreatedAt,
		&m.Username, &m.DisplayName, &role); err != nil {
```

```go
	if previewsJSON.Valid {
		json.Unmarshal([]byte(previewsJSON.String), &m.LinkPreviews)
	}
```

**Step 7: Run all tests**

Run: `go test ./internal/messages/ -v`
Expected: All tests PASS.

**Step 8: Commit**

```bash
git add internal/messages/messages.go internal/messages/messages_test.go
git commit -m "feat: integrate link previews into message creation and queries"
```

---

### Task 6: Add link preview cards to frontend

**Files:**
- Modify: `frontend/src/app.js:1391-1415` (appendMessage function)
- Modify: `frontend/src/app.js:1479-1501` (appendReply function)
- Modify: `frontend/src/style.css` (add preview card styles)

**Step 1: Add the renderLinkPreviews helper function**

Add near the top of `frontend/src/app.js` (near other render helpers like `renderReactions`):

```javascript
function renderLinkPreviews(previews) {
  if (!previews || previews.length === 0) return '';
  return previews.filter(p => p.title).map(p => `
    <div class="link-preview">
      <button class="link-preview-dismiss" title="Dismiss">&times;</button>
      <div class="link-preview-content">
        <div class="link-preview-text">
          ${p.siteName ? `<div class="link-preview-site">${esc(p.siteName)}</div>` : ''}
          <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="link-preview-title">${esc(p.title)}</a>
          ${p.description ? `<div class="link-preview-desc">${esc(p.description)}</div>` : ''}
        </div>
        ${p.image ? `<img class="link-preview-img" src="${esc(p.image)}" alt="" loading="lazy">` : ''}
      </div>
    </div>
  `).join('');
}
```

**Step 2: Update appendMessage to render previews**

In `appendMessage` (around line 1402-1410), add `linkPreviewsHtml` and insert it after `.msg-body`:

```javascript
function appendMessage(msg) {
  const list = document.getElementById("message-list");
  if (!list) return;
  if (list.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  const div = document.createElement("div");
  div.className = "message";
  div.dataset.msgId = msg.id;
  const replyBtn = `<button class="reply-btn btn-sm secondary" data-msg-id="${msg.id}">Reply${msg.replyCount ? ` (${msg.replyCount})` : ""}</button>`;
  const reactionsHtml = renderReactions(msg.id, msg.reactions || []);
  const linkPreviewsHtml = renderLinkPreviews(msg.linkPreviews);
  const botBadge = msg.isBot ? '<span class="bot-badge">BOT</span>' : '';
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(msg.displayName)}</strong>${botBadge}
      <span class="msg-time">${fmtTime(msg.createdAt)}</span>
    </div>
    <div class="msg-body">${renderMarkdown(msg.content)}</div>
    ${linkPreviewsHtml}
    ${reactionsHtml}
    <div class="msg-actions">${replyBtn}</div>
  `;
  div.querySelector(".reply-btn").onclick = () => openThread(msg.id);
  attachReactionHandlers(div, msg.id);
  // Attach dismiss handlers for link previews
  div.querySelectorAll(".link-preview-dismiss").forEach(btn => {
    btn.onclick = () => btn.closest(".link-preview").style.display = "none";
  });
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}
```

**Step 3: Update appendReply to render previews**

Same pattern in `appendReply` (around line 1490-1497):

```javascript
function appendReply(reply) {
  const list = document.getElementById("thread-replies");
  if (!list) return;
  if (list.querySelector(`[data-reply-id="${reply.id}"]`)) return;

  const div = document.createElement("div");
  div.className = "message reply";
  div.dataset.replyId = reply.id;
  div.dataset.msgId = reply.id;
  const reactionsHtml = renderReactions(reply.id, reply.reactions || []);
  const linkPreviewsHtml = renderLinkPreviews(reply.linkPreviews);
  const botBadge = reply.isBot ? '<span class="bot-badge">BOT</span>' : '';
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(reply.displayName)}</strong>${botBadge}
      <span class="msg-time">${fmtTime(reply.createdAt)}</span>
    </div>
    <div class="msg-body">${renderMarkdown(reply.content)}</div>
    ${linkPreviewsHtml}
    ${reactionsHtml}
  `;
  attachReactionHandlers(div, reply.id);
  div.querySelectorAll(".link-preview-dismiss").forEach(btn => {
    btn.onclick = () => btn.closest(".link-preview").style.display = "none";
  });
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}
```

**Step 4: Add CSS styles for link preview cards**

Add to `frontend/src/style.css` after the `.msg-body img` rule (after line 394):

```css
/* Link preview cards */
.link-preview {
  margin: 0.5rem 0 0.25rem;
  border-left: 3px solid #30363d;
  background: #161b22;
  border-radius: 0 4px 4px 0;
  padding: 0.5rem 0.75rem;
  position: relative;
  max-width: 400px;
}
.link-preview-dismiss {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.1rem 0.3rem;
  line-height: 1;
}
.link-preview-dismiss:hover {
  color: #b1bac4;
}
.link-preview-content {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}
.link-preview-text {
  flex: 1;
  min-width: 0;
}
.link-preview-site {
  font-size: 0.7rem;
  color: #484f58;
  margin-bottom: 0.15rem;
}
.link-preview-title {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #58a6ff;
  text-decoration: none;
  margin-bottom: 0.2rem;
}
.link-preview-title:hover {
  text-decoration: underline;
}
.link-preview-desc {
  font-size: 0.8rem;
  color: #7d8590;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.link-preview-img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
```

**Step 5: Build frontend**

Run:
```bash
cd frontend && bun run build
```
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add frontend/src/app.js frontend/src/style.css
git commit -m "feat: add link preview cards to chat messages"
```

---

### Task 7: Full build and manual verification

**Files:**
- Copy: `frontend/dist/*` to `cmd/app/static/`

**Step 1: Copy built frontend to static dir**

```bash
cp frontend/dist/* cmd/app/static/
```

**Step 2: Build Go binary**

```bash
go build -o relay-chat ./cmd/app/
```
Expected: Builds successfully.

**Step 3: Run all Go tests**

```bash
go test ./...
```
Expected: All tests PASS.

**Step 4: Commit the static assets**

```bash
git add cmd/app/static/
git commit -m "build: update static assets with link preview support"
```
