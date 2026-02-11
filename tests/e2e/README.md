# Relay Chat E2E Test Framework

Comprehensive Playwright-based end-to-end test framework for Relay Chat.

## Architecture

### Fixtures (`fixtures/`)
Reusable test fixtures that provide authenticated contexts and helpers:

- **`adminUser`** - First user with admin privileges (auto-created)
- **`memberUser`** - Regular member signed up via invite
- **`twoUsers`** - Both admin and member in separate browser contexts (for real-time testing)
- **`api`** - APIHelper for direct backend calls
- **`auth`** - AuthHelper for authentication flows

### Page Object Models (`pages/`)
Clean abstractions for UI interactions:

- **`ChatPage`** - Main chat interface (messages, channels, reactions)
- **`ThreadPanel`** - Thread sidebar interactions
- **`ChannelModal`** - Channel creation/editing/deletion
- **`LoginPage`** - Login form
- **`SignupPage`** - Signup form (first user + invite flow)
- **`AdminPage`** - Admin panel interactions

### Test Suites (`tests/`)

- **`auth.spec.ts`** - Authentication flows (signup, login, logout, invites)
- **`messaging.spec.ts`** - Send, edit, delete, persistence, markdown
- **`threads.spec.ts`** - Thread creation, replies, "also send to channel"
- **`reactions.spec.ts`** - Add/remove emoji reactions, counts
- **`channels.spec.ts`** - Create, edit, delete channels, #general protection
- **`realtime.spec.ts`** - Real-time updates across two browser contexts
- **`files.spec.ts`** - File uploads (Blossom integration, skipped if not available)

## Quick Start

### Prerequisites

1. Start the dev environment:
   ```bash
   cd /root/.openclaw/workspace-acid_burn/relay-chat
   docker compose -f docker-compose.dev.yml up -d --build
   ```

2. Wait for services to be ready (frontend on :3002, API on :4002)

### Install Dependencies

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/auth.spec.ts

# Run with UI mode (interactive)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Generate report
npm run test:report
```

## Writing New Tests

### Using Fixtures

```typescript
import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test('my test', async ({ adminUser }) => {
  const chat = new ChatPage(adminUser.page);
  
  await chat.sendMessage('Hello!');
  await expect(adminUser.page.locator('text=Hello!')).toBeVisible();
});
```

### Two-User Real-time Tests

```typescript
test('real-time sync', async ({ twoUsers }) => {
  const adminChat = new ChatPage(twoUsers.admin.page);
  const memberChat = new ChatPage(twoUsers.member.page);
  
  await adminChat.sendMessage('From admin');
  await memberChat.waitForMessage('From admin');
});
```

### API Helpers

```typescript
test('setup via API', async ({ adminUser, api }) => {
  // Create channel via API instead of UI (faster)
  const channel = await api.createChannel(
    adminUser.token,
    'test-channel',
    'Description'
  );
  
  // Now test UI interactions
  const chat = new ChatPage(adminUser.page);
  await chat.switchChannel('test-channel');
});
```

## Best Practices

1. **Use unique identifiers** - Append `Date.now()` to usernames/messages to avoid collisions
2. **Clean up after tests** - Fixtures handle cleanup automatically
3. **Use Page Objects** - Never interact with page directly in tests
4. **Wait for real-time updates** - Use `waitForMessage()`, `waitForReply()`, etc.
5. **Test idempotency** - Tests should pass even if run multiple times
6. **Serial execution** - Tests run one at a time to avoid database conflicts

## Configuration

Edit `playwright.config.ts` to adjust:

- Timeouts (default: 30s test, 10s assertions)
- Parallel execution (default: disabled)
- Retries (default: 0 local, 2 CI)
- Screenshots/videos (default: on failure)
- Base URL (default: http://localhost:3002)

## CI Integration

Tests are designed to run in CI with:

- Retries enabled (2 attempts)
- Single worker (no parallelization)
- GitHub Actions reporter
- Automatic artifact collection (screenshots, videos, traces)

Example GitHub Actions workflow:

```yaml
- name: Start dev environment
  run: docker compose -f docker-compose.dev.yml up -d --build

- name: Wait for services
  run: |
    timeout 60 bash -c 'until curl -s http://localhost:3002 > /dev/null; do sleep 2; done'
    timeout 60 bash -c 'until curl -s http://localhost:4002/health > /dev/null; do sleep 2; done'

- name: Run E2E tests
  run: |
    cd tests/e2e
    npm ci
    npx playwright install --with-deps chromium
    npm test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: tests/e2e/playwright-report/
```

## Troubleshooting

### Tests failing locally?

1. **Check dev environment is running:**
   ```bash
   docker compose -f docker-compose.dev.yml ps
   curl http://localhost:3002
   curl http://localhost:4002/health
   ```

2. **Clear test database:**
   ```bash
   docker compose -f docker-compose.dev.yml down -v
   docker compose -f docker-compose.dev.yml up -d --build
   ```

3. **Run with debug mode:**
   ```bash
   PWDEBUG=1 npm test -- tests/auth.spec.ts
   ```

### Race conditions?

- Tests use `waitForLoadState('networkidle')` and explicit waits
- If flaky, increase timeout in `playwright.config.ts`
- Check WebSocket connection in browser devtools

### Missing elements?

- Use `npx playwright codegen http://localhost:3002` to inspect selectors
- Page Objects use multiple selector strategies (text, role, id)
- Update selectors in `pages/` if UI changes

## Structure

```
tests/e2e/
├── fixtures/
│   ├── index.ts          # Main fixtures (adminUser, memberUser, twoUsers)
│   ├── auth.ts           # Auth helpers (login, signup, token management)
│   └── chat.ts           # [Legacy] ChatPage (moved to pages/)
├── pages/
│   ├── ChatPage.ts       # Main chat interface POM
│   ├── ThreadPanel.ts    # Thread sidebar POM
│   ├── ChannelModal.ts   # Channel CRUD modal POM
│   ├── LoginPage.ts      # Login form POM
│   ├── SignupPage.ts     # Signup form POM
│   └── AdminPage.ts      # Admin panel POM
├── tests/
│   ├── auth.spec.ts      # Authentication tests
│   ├── messaging.spec.ts # Message CRUD tests
│   ├── threads.spec.ts   # Thread functionality tests
│   ├── reactions.spec.ts # Emoji reactions tests
│   ├── channels.spec.ts  # Channel management tests
│   ├── realtime.spec.ts  # Real-time sync tests (two users)
│   └── files.spec.ts     # File upload tests (Blossom)
├── test-fixtures/        # Test files (images, docs)
├── playwright.config.ts  # Playwright configuration
├── package.json          # Dependencies
└── README.md             # This file
```

## Maintenance

### Adding New Tests

1. Create new spec file in `tests/` following naming convention
2. Import fixtures and Page Objects
3. Use descriptive `test.describe()` blocks
4. Keep tests focused (one behavior per test)
5. Update this README with new test coverage

### Updating Page Objects

When UI changes:
1. Update selectors in relevant Page Object (`pages/*.ts`)
2. Add new methods for new UI interactions
3. Keep methods simple and single-purpose
4. Return promises or values, handle waits internally

### Adding New Fixtures

1. Extend fixtures in `fixtures/index.ts`
2. Document fixture purpose and cleanup behavior
3. Use `await use()` pattern properly
4. Clean up resources in fixture teardown

## Coverage

Current test coverage:

- ✅ Auth: First user signup, invite flow, login/logout, invalid credentials
- ✅ Messaging: Send, edit, delete, persistence, markdown rendering
- ✅ Threads: Create thread, reply, "also send to channel", count updates
- ✅ Reactions: Add, remove, toggle, multiple reactions, counts
- ✅ Channels: Create, edit, delete, switch, #general protection
- ✅ Real-time: Message sync, edits, deletions, reactions, threads across users
- 🟡 File uploads: Image preview, download links (Blossom-dependent)
- ❌ Admin: User removal, promotion (TODO)
- ❌ Profile: Avatar, display name changes (TODO)

## License

Same as Relay Chat project.
