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
