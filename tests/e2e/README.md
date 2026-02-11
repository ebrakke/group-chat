# Relay Chat E2E Tests

End-to-end tests for Relay Chat using Playwright.

## Setup

1. Install dependencies:
   ```bash
   cd tests/e2e
   npm install
   npx playwright install chromium
   ```

2. Make sure the dev environment is running:
   ```bash
   cd ../..
   make dev
   ```

   The tests expect:
   - Frontend on `http://localhost:3002`
   - API on `http://localhost:4002`

## Running Tests

From the repo root:

```bash
make test-e2e          # Run all e2e tests
```

From the `tests/e2e` directory:

```bash
npm test               # Run all tests (headless)
npm run test:headed    # Run with browser visible
npm run test:ui        # Open Playwright UI mode
npm run test:debug     # Debug mode (step through tests)
npm run report         # View last test report
```

## Test Structure

```
tests/e2e/
├── fixtures/          # Reusable test helpers
│   ├── auth.ts       # Auth helpers (signup, login, logout)
│   └── chat.ts       # Chat page object model
├── tests/            # Test specs
│   ├── 01-auth.spec.ts      # Authentication flows
│   ├── 02-channels.spec.ts  # Channel navigation
│   ├── 03-messaging.spec.ts # Message CRUD operations
│   ├── 04-threads.spec.ts   # Thread replies
│   └── 05-reactions.spec.ts # Emoji reactions
├── playwright.config.ts
└── package.json
```

## Test Coverage

### 1. Authentication (`01-auth.spec.ts`)
- ✅ First user signup (becomes admin)
- ✅ Login with existing user
- ✅ Invalid login shows error
- ✅ Logout
- ✅ Redirect to login when not authenticated

### 2. Channels (`02-channels.spec.ts`)
- ✅ Display channel list with #general by default
- ✅ Switch between channels
- ✅ Highlight current channel
- ✅ Show channel description
- ✅ Preserve channel context on reload

### 3. Messaging (`03-messaging.spec.ts`)
- ✅ Send message and see it appear in real-time
- ✅ Send multiple messages
- ✅ Support markdown formatting
- ✅ Edit message
- ✅ Cancel edit
- ✅ Delete message
- ✅ Show message actions on hover
- ✅ Auto-scroll to new messages

### 4. Threads (`04-threads.spec.ts`)
- ✅ Open thread panel on reply click
- ✅ Post thread reply
- ✅ See reply in real-time
- ✅ Increment thread count
- ✅ Clickable thread count link
- ✅ Close thread panel
- ✅ Multiple threads on different messages
- ✅ Maintain thread context when switching

### 5. Reactions (`05-reactions.spec.ts`)
- ✅ Add emoji reaction
- ✅ Toggle reaction on/off
- ✅ Show reaction count
- ✅ Multiple reactions on same message
- ✅ Highlight user's own reactions
- ✅ Close emoji picker
- ✅ Persist reactions after reload

## Best Practices

1. **Independent Tests**: Each test creates its own fresh user via signup to avoid conflicts.

2. **Page Object Models**: Reusable helpers in `fixtures/chat.ts` abstract common actions:
   - `chat.sendMessage(content)`
   - `chat.editMessage(old, new)`
   - `chat.deleteMessage(content)`
   - `chat.openThread(message)`
   - `chat.addReaction(message, emoji)`

3. **Real-Time Testing**: Tests verify WebSocket functionality by checking messages appear without page refresh.

4. **Retry Logic**: Tests use proper waits and timeouts for real-time updates (5s default).

5. **Cleanup**: Each test is self-contained; auth state is cleared between tests.

## Troubleshooting

**Tests fail with "Cannot connect to server":**
- Ensure dev stack is running: `make dev`
- Check ports 3002 and 4002 are accessible

**Tests timeout waiting for elements:**
- Increase timeout in `playwright.config.ts`
- Check WebSocket connection in browser console
- Verify database is accessible

**Flaky tests:**
- Tests may need longer waits for real-time updates
- Adjust `waitForTimeout` values if needed
- Check network latency

**First test always fails:**
- Some tests assume users exist; run the full suite to populate DB
- Or manually create a user first

## CI/CD Integration

The tests are configured to run in CI mode when `CI=1`:
- Retries failing tests up to 2 times
- Uses single worker (serial execution)
- Outputs GitHub Actions format

Example:
```bash
CI=1 npm test
```

## Adding New Tests

1. Create a new spec file in `tests/` (e.g., `06-admin.spec.ts`)
2. Import fixtures: `import { test, expect } from '../fixtures/auth';`
3. Use `authenticatedPage` fixture for logged-in tests
4. Use page object helpers from `chat.ts` for common actions
5. Keep tests focused and independent

Example:
```typescript
import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

test.describe('My Feature', () => {
  test('should do something', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    await chat.sendMessage('Hello');
    // ... assertions
  });
});
```
