package branding

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"

	"github.com/disintegration/imaging"
	_ "golang.org/x/image/webp"

	_ "embed"
)

//go:embed defaults/icon-192.png
var DefaultIcon192 []byte

//go:embed defaults/icon-512.png
var DefaultIcon512 []byte

// ProcessIcon decodes src (PNG, JPEG, or WebP), centre-crops and resizes it to
// a size×size square, encodes it as PNG, and returns the base64-encoded result.
func ProcessIcon(src []byte, size int) (string, error) {
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return "", fmt.Errorf("decode image: %w", err)
	}
	resized := imaging.Fill(img, size, size, imaging.Center, imaging.Lanczos)
	var buf bytes.Buffer
	if err := png.Encode(&buf, resized); err != nil {
		return "", fmt.Errorf("encode png: %w", err)
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
