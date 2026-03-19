VERSION ?= dev
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -ldflags "-X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)"

.PHONY: build run dev test test-e2e frontend clean help release

help:
	@echo "Relay Chat"
	@echo ""
	@echo "  make dev        - Build + (re)start dev server on :8080 (kills old process)"
	@echo "  make build      - Build frontend + Go binary"
	@echo "  make run        - Build and run (foreground, DATA_DIR=./tmp)"
	@echo "  make test       - Run Go unit tests"
	@echo "  make test-e2e   - Run Playwright E2E tests"
	@echo "  make frontend   - Build frontend only"
	@echo "  make release VERSION=0.1.0 - Build release binaries (linux/darwin × amd64/arm64)"
	@echo "  make clean      - Remove build artifacts"

frontend:
	cd frontend && bun install && bun run build
	rm -rf cmd/app/static/*
	cp -r frontend/dist/* cmd/app/static/

build: frontend
	go build $(LDFLAGS) -o relay-chat ./cmd/app/

run: build
	mkdir -p tmp
	DATA_DIR=./tmp ./relay-chat

dev: build
	@echo "--- Stopping old relay-chat on :8080 ---"
	@-lsof -ti:8080 | xargs kill 2>/dev/null; sleep 0.3
	@mkdir -p tmp
	@echo "--- Starting relay-chat on http://localhost:8080 ---"
	@echo "    DB: ./tmp/app.db (persists between restarts)"
	@echo "    DEV_MODE: admin/admin user auto-created if no users exist"
	@echo "    Ctrl+C to stop"
	DEV_MODE=true DATA_DIR=./tmp ./relay-chat serve

test:
	go test ./internal/... -count=1

test-e2e:
	./scripts/run-e2e.sh

clean:
	rm -f relay-chat
	rm -rf frontend/dist
	rm -rf tmp

release:
ifndef VERSION
	$(error VERSION is required. Usage: make release VERSION=0.1.0)
endif
	bash scripts/release.sh $(VERSION)
