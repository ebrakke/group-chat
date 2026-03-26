package messages

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
)

var ogClient = &http.Client{Timeout: 5 * time.Second}

// youtubeRe matches youtube.com/watch, youtu.be, and youtube.com/shorts URLs.
var youtubeRe = regexp.MustCompile(`^https?://(?:www\.)?(?:youtube\.com/(?:watch|shorts)|youtu\.be/)`)

// isYouTubeURL checks if a URL is a YouTube video/shorts URL.
func isYouTubeURL(rawURL string) bool {
	return youtubeRe.MatchString(rawURL)
}

// youtubeOEmbed represents the relevant fields from YouTube's oEmbed API.
type youtubeOEmbed struct {
	Title        string `json:"title"`
	AuthorName   string `json:"author_name"`
	ThumbnailURL string `json:"thumbnail_url"`
	ProviderName string `json:"provider_name"`
}

// fetchYouTubePreview uses YouTube's oEmbed API to get link preview metadata.
// YouTube pages are too large (>600KB of inline JS in <head>) for OG tag scraping.
func fetchYouTubePreview(rawURL string) *LinkPreview {
	oembedURL := "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape(rawURL)
	req, err := http.NewRequest("GET", oembedURL, nil)
	if err != nil {
		return nil
	}

	resp, err := ogClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil
	}

	var oembed youtubeOEmbed
	if err := json.NewDecoder(resp.Body).Decode(&oembed); err != nil || oembed.Title == "" {
		return nil
	}

	desc := oembed.AuthorName
	return &LinkPreview{
		Title:       oembed.Title,
		Description: desc,
		Image:       oembed.ThumbnailURL,
		SiteName:    oembed.ProviderName,
	}
}

// fetchOGMetadata fetches a URL and extracts Open Graph metadata.
// Returns nil if the fetch fails or no title is found.
func fetchOGMetadata(rawURL string) *LinkPreview {
	// YouTube pages have >600KB of inline JS before OG tags, exceeding our
	// body read limit. Use their oEmbed API instead for reliable previews.
	// Fall back to OG scraping if oEmbed fails (e.g. age-restricted videos).
	if isYouTubeURL(rawURL) {
		if lp := fetchYouTubePreview(rawURL); lp != nil {
			return lp
		}
	}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RelayChat/1.0; +https://relay.chat)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

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

	// Limit read to 1MB to avoid downloading huge pages.
	// Some sites (e.g. SPAs) put significant JS in <head> before OG tags.
	body := io.LimitReader(resp.Body, 1024*1024)
	return parseOGTags(body)
}

// parseOGTags parses OG meta tags from an HTML reader.
// Falls back to <title> and <meta name="description"> if OG tags are missing.
func parseOGTags(r io.Reader) *LinkPreview {
	tokenizer := html.NewTokenizer(r)
	var lp LinkPreview
	var htmlTitle string
	var metaDesc string
	var inTitle bool

	for {
		tt := tokenizer.Next()
		switch tt {
		case html.ErrorToken:
			if lp.Title == "" {
				lp.Title = htmlTitle
			}
			if lp.Description == "" {
				lp.Description = metaDesc
			}
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
					lp.Title = htmlTitle
				}
				if lp.Description == "" {
					lp.Description = metaDesc
				}
				if lp.Title == "" {
					return nil
				}
				return &lp
			}

			if tagName == "title" {
				inTitle = true
				continue
			}

			if tagName != "meta" || !hasAttr {
				continue
			}

			var property, name, content string
			for {
				key, val, more := tokenizer.TagAttr()
				k := string(key)
				v := string(val)
				if k == "property" {
					property = v
				} else if k == "name" {
					name = v
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

			// Fallback: <meta name="description">
			if name == "description" && content != "" && metaDesc == "" {
				metaDesc = content
			}
		case html.TextToken:
			if inTitle {
				htmlTitle = strings.TrimSpace(string(tokenizer.Text()))
				inTitle = false
			}
		case html.EndTagToken:
			inTitle = false
		}
	}
}
