# E2E Test Setup Guide

## Quick Start

1. **Install dependencies**:
   ```bash
   cd tests/e2e
   npm install
   npx playwright install chromium
   ```

2. **Start the dev environment** (in a separate terminal):
   ```bash
   cd /root/.openclaw/workspace-acid_burn/relay-chat
   make dev
   ```

3. **Run the tests**:
   ```bash
   # From repo root
   make test-e2e

   # Or from tests/e2e directory
   npm test
   ```

## What Was Created

### Directory Structure
```
tests/e2e/
├── fixtures/
│   ├── auth.ts          # Auth helpers (signup, login, logout, tokens)
│   └── chat.ts          # Chat page object model
├── tests/
│   ├── 01-auth.spec.ts      # Authentication tests
│   ├── 02-channels.spec.ts  # Channel navigation tests
│   ├── 03-messaging.spec.ts # Messaging CRUD tests
│   ├── 04-threads.spec.ts   # Thread reply tests
│   └── 05-reactions.spec.ts # Emoji reaction tests
├── package.json         # Playwright dependencies
├── playwright.config.ts # Playwright configuration
├── tsconfig.json        # TypeScript config
├── .gitignore
├── README.md           # Full documentation
└── SETUP.md            # This file
```

### Test Coverage Summary

- **30+ test cases** covering all major flows
- **Independent tests** - each creates fresh user
- **Real-time validation** - verifies WebSocket updates
- **Page object models** - reusable helpers for maintainability

## Development Workflow

### Running Specific Tests
```bash
# Run only auth tests
npm test -- 01-auth.spec.ts

# Run with UI (interactive mode)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug a specific test
npm run test:debug -- 03-messaging.spec.ts
```

### Writing New Tests

1. Create a new spec file in `tests/`:
   ```typescript
   import { test, expect } from '../fixtures/auth';
   import { ChatPage } from '../fixtures/chat';

   test.describe('My Feature', () => {
     test('should work', async ({ authenticatedPage }) => {
       const chat = new ChatPage(authenticatedPage);
       // ... test logic
     });
   });
   ```

2. Use the fixtures:
   - `auth` - Auth helper methods
   - `authenticatedPage` - Pre-logged-in page context
   - `ChatPage` - Page object for chat interactions

3. Run your test:
   ```bash
   npm test -- my-feature.spec.ts
   ```

## Makefile Integration

The following targets were added to the root Makefile:

```bash
make test-e2e    # Run all Playwright e2e tests
```

This integrates seamlessly with existing test commands:
```bash
make test        # Run simple messaging verification
make test-e2e    # Run full Playwright test suite
```

## CI/CD Ready

Tests are configured for CI environments:

```bash
CI=1 npm test
```

Features:
- 2 retries on failure
- Serial execution (1 worker)
- GitHub Actions reporter format
- Screenshots on failure
- Video on failure

## Troubleshooting

**Installation fails:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npx playwright install --with-deps chromium
```

**Tests timeout:**
- Check dev stack is running: `docker ps`
- Verify ports: `curl http://localhost:3002` and `curl http://localhost:4002`
- Increase timeout in `playwright.config.ts`

**Database conflicts:**
```bash
# Reset dev database
make dev-reset
make dev
```

**Flaky tests:**
- Run with `--retries=3` flag
- Check for race conditions
- Increase wait times in affected tests

## Best Practices

1. ✅ **Independent**: Each test creates its own user
2. ✅ **Idempotent**: Tests can run multiple times
3. ✅ **Descriptive**: Clear test names and assertions
4. ✅ **Fast**: Parallel execution where possible
5. ✅ **Maintainable**: Page objects abstract UI details
6. ✅ **Real-time**: Validates WebSocket behavior

## Next Steps

- Add admin panel tests
- Add settings tests
- Add invite link tests
- Add search/filter tests
- Add mobile viewport tests
- Add accessibility tests

Happy testing! 🎭
