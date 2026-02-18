.PHONY: build run dev test test-e2e frontend clean help

help:
	@echo "Relay Chat"
	@echo ""
	@echo "  make dev        - Build + (re)start dev server on :8080 (kills old process)"
	@echo "  make build      - Build frontend + Go binary"
	@echo "  make run        - Build and run (foreground, DATA_DIR=./tmp)"
	@echo "  make test       - Run Go unit tests"
	@echo "  make test-e2e   - Run Playwright E2E tests"
	@echo "  make frontend   - Build frontend only"
	@echo "  make clean      - Remove build artifacts"

frontend:
	cd frontend && bun install && bun run build
	rm -f cmd/app/static/app.*.js cmd/app/static/style.*.css
	cp frontend/dist/* cmd/app/static/

build: frontend
	go build -o relay-chat ./cmd/app/

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
