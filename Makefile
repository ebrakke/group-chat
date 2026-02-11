.PHONY: dev dev-down dev-reset prod prod-down prod-reset test test-e2e help

# Default target
help:
	@echo "Relay Chat - Development & Production Commands"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev         - Start dev stack (ports 3002/4002)"
	@echo "  make dev-down    - Stop dev stack"
	@echo "  make dev-reset   - Stop dev stack and wipe volumes"
	@echo ""
	@echo "Production Commands:"
	@echo "  make prod        - Build and start production stack (ports 3000/4000)"
	@echo "  make prod-down   - Stop production stack"
	@echo "  make prod-reset  - Stop production stack and wipe volumes"
	@echo ""
	@echo "Testing:"
	@echo "  make test        - Run messaging verification against dev stack"
	@echo "  make test-prod   - Run messaging verification against production stack"
	@echo "  make test-e2e    - Run Playwright e2e tests (requires dev stack running)"

# Development environment
dev:
	@echo "🚀 Starting development stack..."
	docker compose -f docker-compose.dev.yml up --build

dev-down:
	@echo "🛑 Stopping development stack..."
	docker compose -f docker-compose.dev.yml down

dev-reset:
	@echo "🧹 Stopping dev stack and wiping volumes..."
	docker compose -f docker-compose.dev.yml down -v
	@echo "✅ Dev environment reset complete"

# Production environment
prod:
	@echo "🚀 Building and starting production stack..."
	docker compose up --build

prod-down:
	@echo "🛑 Stopping production stack..."
	docker compose down

prod-reset:
	@echo "🧹 Stopping production stack and wiping volumes..."
	docker compose down -v
	@echo "✅ Production environment reset complete"

# Testing
test:
	@echo "🧪 Running messaging verification against dev stack (port 4002)..."
	@node test-messaging.js http://localhost:4002

test-prod:
	@echo "🧪 Running messaging verification against production stack (port 4000)..."
	@node test-messaging.js http://localhost:4000

test-e2e:
	@echo "🎭 Running Playwright e2e tests..."
	@echo "📌 Make sure dev stack is running (make dev)"
	@cd tests/e2e && npm test
