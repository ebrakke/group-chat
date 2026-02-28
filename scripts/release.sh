#!/bin/bash
set -e

VERSION="${1:?Usage: $0 <version>}"
COMMIT=$(git rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS="-X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}"

DIST="dist"
rm -rf "$DIST"
mkdir -p "$DIST"

# Build frontend first
cd frontend && bun install && bun run build && cd ..
rm -rf cmd/app/static/*
cp -r frontend/dist/* cmd/app/static/

# Build for each platform
for GOOS in linux darwin; do
  for GOARCH in amd64 arm64; do
    OUTPUT="${DIST}/relay-chat-${VERSION}-${GOOS}-${GOARCH}"
    echo "Building ${GOOS}/${GOARCH}..."
    GOOS=$GOOS GOARCH=$GOARCH go build -ldflags "$LDFLAGS" -o "$OUTPUT" ./cmd/app/
  done
done

echo ""
echo "Release binaries in ${DIST}/:"
ls -lh "$DIST/"
