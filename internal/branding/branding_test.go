package branding_test

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/ebrakke/relay-chat/internal/branding"
)

func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 255, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode test PNG: %v", err)
	}
	return buf.Bytes()
}

func TestProcessIcon_ResizesToSquare(t *testing.T) {
	src := makePNG(t, 400, 300) // non-square source

	got, err := branding.ProcessIcon(src, 192)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(got)
	if err != nil {
		t.Fatalf("result is not valid base64: %v", err)
	}

	result, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		t.Fatalf("result is not a valid image: %v", err)
	}

	bounds := result.Bounds()
	if bounds.Dx() != 192 || bounds.Dy() != 192 {
		t.Errorf("expected 192x192, got %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestProcessIcon_512(t *testing.T) {
	src := makePNG(t, 600, 600)

	got, err := branding.ProcessIcon(src, 512)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	decoded, _ := base64.StdEncoding.DecodeString(got)
	result, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		t.Fatalf("result is not a valid image: %v", err)
	}

	bounds := result.Bounds()
	if bounds.Dx() != 512 || bounds.Dy() != 512 {
		t.Errorf("expected 512x512, got %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestProcessIcon_RejectsInvalidData(t *testing.T) {
	_, err := branding.ProcessIcon([]byte("not an image"), 192)
	if err == nil {
		t.Error("expected error for invalid image data, got nil")
	}
}

func TestDefaultIcons_AreValid(t *testing.T) {
	for name, data := range map[string][]byte{
		"DefaultIcon192": branding.DefaultIcon192,
		"DefaultIcon512": branding.DefaultIcon512,
	} {
		if len(data) == 0 {
			t.Errorf("%s: embedded data is empty", name)
			continue
		}
		_, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			t.Errorf("%s: not a valid image: %v", name, err)
		}
	}
}
