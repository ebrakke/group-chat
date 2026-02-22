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
		// Block until the request context is cancelled (client timeout or server close)
		<-r.Context().Done()
	}))
	defer ts.Close()

	// Should return nil (timeout), not block forever
	lp := fetchOGMetadata(ts.URL)
	if lp != nil {
		t.Errorf("expected nil on timeout, got %+v", lp)
	}
}
