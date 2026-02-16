.PHONY: build run test test-e2e frontend clean help

help:
	@echo "Relay Chat"
	@echo ""
	@echo "  make build      - Build frontend + Go binary"
	@echo "  make run        - Build and run (DATA_DIR=./tmp)"
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

test:
	go test ./internal/... -count=1

test-e2e:
	./scripts/run-e2e.sh

clean:
	rm -f relay-chat
	rm -rf frontend/dist
	rm -rf tmp
