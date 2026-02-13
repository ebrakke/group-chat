# Relay Chat E2E Test Infrastructure

Comprehensive documentation for the end-to-end testing framework for Relay Chat.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Fixtures](#fixtures)
- [Page Objects](#page-objects)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)

---

## Overview

The Relay Chat e2e test suite uses **Playwright** to test the full application stack:
- **Frontend** (SvelteKit) on port 3002
- **API** (Express + SQLite) on port 4002  
- **Relay** (Nostr relay) on port 3336
- **Blossom** (file storage) on port 3337

Tests verify the complete user experience, from signup to real-time messaging.

### Key Features

✅ **Reliable auth fixtures** - Handles database resets and invite code requirements  
✅ **Clean test isolation** - Each test starts with a fresh database state  
✅ **Page Object Model** - Maintainable, reusable page abstractions  
✅ **API helpers** - Direct backend access for faster test setup  
✅ **Real-time validation** - Tests actual WebSocket behavior  

---

## Architecture

### Test Flow

```
┌─────────────────┐
│ Global Setup    │ ← Resets database, waits for services
└────────┬────────┘
         │
         ├──► Test 1 (isolated browser context)
         ├──► Test 2 (isolated browser context)
         └──► Test 3 (isolated browser context)
```

### Component Layers

```
┌──────────────────────────────────────┐
│  Test Specs (tests/*.spec.ts)       │
├──────────────────────────────────────┤
│  Fixtures (fixtures/index.ts)       │
│  - adminUser, memberUser, twoUsers  │
├──────────────────────────────────────┤
│  Page Objects (pages/*.ts)          │
│  - ChatPage, LoginPage, etc.        │
├──────────────────────────────────────┤
│  API Helpers (fixtures/index.ts)    │
│  - APIHelper for direct API calls   │
└──────────────────────────────────────┘
```

### Database Management

**Location:**  
- Container: `api`  
- Path: `/data/relay-chat.db`  
- Volume: `dev-api-data`

**Reset Strategy:**  
1. `global-setup.ts` runs before all tests
2. Deletes database files from the API container
3. Restarts the API container
4. Waits for health check to pass
5. Tests run with fresh database

**Bootstrap Admin:**  
- First user created has admin privileges
- Token is cached and reused across tests
- Automatically recreated if database resets mid-run
- Used to generate invite codes for new users

---

## Setup

### Prerequisites

```bash
# Start the dev environment
cd /root/.openclaw/workspace-acid_burn/relay-chat
docker compose -f docker-compose.dev.yml up -d

# Verify services are running
docker compose -f docker-compose.dev.yml ps

# Check API health
curl http://localhost:4002/api/v1/health
```

### Install Test Dependencies

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test tests/smoke.spec.ts
```

### Run in UI Mode (Interactive)

```bash
npm run test:ui
```

### Run in Headed Mode (See Browser)

```bash
npm run test:headed
```

### Debug a Single Test

```bash
npm run test:debug tests/smoke.spec.ts
```

### View Test Report

```bash
npm run test:report
```

---

## Test Structure

### Directory Layout

```
tests/e2e/
├── fixtures/
│   ├── index.ts          # Main fixtures (adminUser, memberUser, etc.)
│   ├── auth.ts           # Auth helper (login, signup, tokens)
│   └── chat.ts           # Chat-specific helpers
├── pages/
│   ├── ChatPage.ts       # Main chat interface
│   ├── LoginPage.ts      # Login page
│   ├── SignupPage.ts     # Signup page
│   ├── AdminPage.ts      # Admin panel
│   ├── ChannelModal.ts   # Channel creation modal
│   └── ThreadPanel.ts    # Thread sidebar
├── tests/
│   ├── global-setup.ts   # Database reset before all tests
│   ├── smoke.spec.ts     # Critical happy path tests
│   ├── auth.spec.ts      # Authentication flows
│   ├── messaging.spec.ts # Message CRUD operations
│   ├── threads.spec.ts   # Thread functionality
│   ├── reactions.spec.ts # Emoji reactions
│   ├── channels.spec.ts  # Channel management
│   ├── file-uploads.spec.ts # File attachment tests
│   ├── mobile.spec.ts    # Mobile viewport tests
│   └── admin.spec.ts     # Admin-only features
├── playwright.config.ts  # Playwright configuration
├── package.json          # Test scripts
└── README.md             # This file
```

### Test Naming Convention

```typescript
test.describe('Feature Area', () => {
  test('should do something specific', async ({ fixture }) => {
    // Test implementation
  });
});
```

Use descriptive test names that explain **what** is being tested, not **how**.

---

## Fixtures

Fixtures provide pre-configured test contexts. They handle user creation, authentication, and cleanup automatically.

### Available Fixtures

#### `auth`
Auth helper for manual signup/login flows.

```typescript
test('manual signup flow', async ({ auth }) => {
  await auth.signup('testuser', 'Test User', 'password123');
  await auth.logout();
  await auth.login('testuser', 'password123');
});
```

#### `api`
Direct API access for setup/teardown without UI interaction.

```typescript
test('create channel via API', async ({ api, adminUser }) => {
  const channel = await api.createChannel(adminUser.token, 'test-channel');
  await api.sendMessage(adminUser.token, channel.id, 'Hello!');
});
```

#### `adminUser`
Pre-authenticated admin user in a fresh browser context.

```typescript
test('admin creates channel', async ({ adminUser }) => {
  await adminUser.page.goto('/');
  const chatPage = new ChatPage(adminUser.page);
  await chatPage.openCreateChannelModal();
  // ...
});
```

**Properties:**
- `page` - Playwright Page object
- `token` - Auth token for API calls
- `user` - User object (id, username, role, etc.)
- `api` - API helper instance
- `username` - Username
- `password` - Password

#### `memberUser`
Pre-authenticated member user (non-admin) in a fresh browser context.

```typescript
test('member sends message', async ({ memberUser }) => {
  await memberUser.page.goto('/');
  const chatPage = new ChatPage(memberUser.page);
  await chatPage.sendMessage('Hello from member!');
});
```

#### `twoUsers`
Two pre-authenticated users in separate browser contexts.

```typescript
test('DM between users', async ({ twoUsers }) => {
  const { admin, member } = twoUsers;
  
  const adminChat = new ChatPage(admin.page);
  const memberChat = new ChatPage(member.page);
  
  await adminChat.sendMessage('Hello from admin!');
  await memberChat.waitForMessage('Hello from admin!');
});
```

### Fixture Lifecycle

```
Test Start
   ├─► Create browser context
   ├─► Ensure bootstrap admin exists (create if needed)
   ├─► Create invite code (if required)
   ├─► Signup new user via API
   ├─► Login user via UI
   └─► Run test
       └─► Close browser context (cleanup)
```

---

## Page Objects

Page Objects encapsulate page interactions and selectors, making tests more readable and maintainable.

### ChatPage

Main chat interface with message sending, editing, reactions, and threads.

```typescript
import { ChatPage } from '../pages/ChatPage';

test('send and edit message', async ({ adminUser }) => {
  const chatPage = new ChatPage(adminUser.page);
  
  await chatPage.sendMessage('Original message');
  await chatPage.editMessage('Original message', 'Edited message');
  await chatPage.waitForMessage('Edited message');
});
```

**Key Methods:**
- `sendMessage(content)` - Send a message
- `waitForMessage(content)` - Wait for message to appear
- `editMessage(original, newContent)` - Edit a message
- `deleteMessage(content)` - Delete a message
- `switchChannel(name)` - Change active channel
- `openThread(messageContent)` - Open thread panel
- `addReaction(messageContent, emoji)` - React to message

### LoginPage

Login page interactions.

```typescript
import { LoginPage } from '../pages/LoginPage';

test('login with invalid credentials', async ({ page }) => {
  const loginPage = new LoginPage(page);
  
  await loginPage.goto();
  await loginPage.login('baduser', 'badpass');
  
  expect(await loginPage.hasError()).toBe(true);
});
```

**Key Methods:**
- `goto()` - Navigate to login page
- `login(username, password)` - Fill and submit login form
- `loginAndWaitForChat(username, password)` - Login and wait for redirect
- `hasError()` - Check if error message is visible
- `getErrorMessage()` - Get error text

### SignupPage

Signup page interactions.

```typescript
import { SignupPage } from '../pages/SignupPage';

test('first user signup', async ({ page }) => {
  const signupPage = new SignupPage(page);
  
  await signupPage.goto();
  await signupPage.signup('firstuser', 'First User', 'password123');
  
  // Should redirect to chat
  expect(page.url()).toContain('/');
});
```

---

## Common Patterns

### Pattern 1: API Setup + UI Verification

Use API to set up test data quickly, then verify via UI.

```typescript
test('verify message appears in UI', async ({ adminUser }) => {
  const chatPage = new ChatPage(adminUser.page);
  
  // Setup via API (fast)
  await adminUser.api.sendMessage(adminUser.token, 'general', 'Test message');
  
  // Verify via UI (what users see)
  await chatPage.waitForMessage('Test message');
});
```

### Pattern 2: Multi-User Real-Time Interaction

Test WebSocket synchronization between users.

```typescript
test('message appears for other users', async ({ twoUsers }) => {
  const { admin, member } = twoUsers;
  
  const adminChat = new ChatPage(admin.page);
  const memberChat = new ChatPage(member.page);
  
  // Admin sends message
  await adminChat.sendMessage('Hello everyone!');
  
  // Member sees it in real-time
  await memberChat.waitForMessage('Hello everyone!');
});
```

### Pattern 3: Error Handling

Verify proper error states and user feedback.

```typescript
test('shows error on invalid login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  
  await loginPage.goto();
  await loginPage.login('nonexistent', 'wrongpass');
  
  await expect(loginPage.errorMessage).toBeVisible();
  await expect(loginPage.errorMessage).toContainText('Invalid');
});
```

### Pattern 4: Wait for Asynchronous Updates

Use Playwright's auto-waiting instead of manual sleeps.

```typescript
// ❌ BAD: Manual sleep
await page.click('button');
await page.waitForTimeout(2000);

// ✅ GOOD: Wait for specific condition
await page.click('button');
await expect(page.locator('.success-message')).toBeVisible();
```

---

## Troubleshooting

### Tests Fail with "403 Forbidden: Admin access required"

**Cause:** Bootstrap admin token became invalid after database reset.

**Fix:** This should be handled automatically by fixtures now. If it persists:
1. Check `global-setup.ts` is running before tests
2. Verify database is being reset correctly
3. Check `ensureBootstrapAdmin()` in `fixtures/index.ts`

### Tests Fail with "Signup failed: Invite code required"

**Cause:** `INVITE_REQUIRED=true` but test doesn't provide invite code.

**Fix:** Tests should handle this automatically via `createInviteIfRequired()`. Verify:
- `docker-compose.dev.yml` has `INVITE_REQUIRED=false` (recommended for tests)
- If using `INVITE_REQUIRED=true`, ensure fixtures create invites

### Database Changes Don't Persist Between Tests

**Expected behavior.** Each test run starts with a fresh database via `global-setup.ts`.

If you need persistent data, use API helpers in `beforeAll()` hooks:

```typescript
test.describe('channel tests', () => {
  let channelId: string;
  
  test.beforeAll(async ({ api, adminUser }) => {
    const channel = await api.createChannel(adminUser.token, 'persistent-channel');
    channelId = channel.id;
  });
  
  test('test using channel', async ({ adminUser }) => {
    // Use channelId
  });
});
```

### Flaky Tests: Selectors Match Multiple Elements

**Cause:** Non-unique selectors or improper scoping.

**Fix:** Use more specific selectors or scope to parent elements.

```typescript
// ❌ BAD: Ambiguous
await page.click('button');

// ✅ GOOD: Specific
await page.click('button[type="submit"]');

// ✅ BETTER: Scoped
const modal = page.locator('div[role="dialog"]');
await modal.locator('button:has-text("Confirm")').click();
```

**Future improvement:** Add `data-testid` attributes to critical elements.

### Tests Timeout on CI But Pass Locally

**Common causes:**
- CI has slower performance (increase timeouts)
- Race conditions (improve wait strategies)
- Resource constraints (reduce parallel workers)

**Fixes:**
```typescript
// Increase timeout for CI
test.setTimeout(process.env.CI ? 60000 : 30000);

// Use explicit waits
await expect(page.locator('.message')).toBeVisible({ timeout: 10000 });

// Reduce workers in playwright.config.ts
workers: process.env.CI ? 1 : 2
```

### Frontend Source Changes Require Full Rebuild

**No longer an issue!** Docker Compose now mounts source directories:

```yaml
volumes:
  - ./frontend/src:/app/src:ro
  - ./api/src:/app/src:ro
```

Changes to `.ts`, `.svelte`, and `.js` files are reflected immediately (via hot-reload or container restart).

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Start dev environment
        run: |
          docker compose -f docker-compose.dev.yml up -d --build
          sleep 10
      
      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -f http://localhost:4002/api/v1/health; do sleep 2; done'
      
      - name: Install test dependencies
        run: |
          cd tests/e2e
          npm ci
          npx playwright install --with-deps chromium
      
      - name: Run smoke tests
        run: |
          cd tests/e2e
          npm run test:ci
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/
      
      - name: Cleanup
        if: always()
        run: docker compose -f docker-compose.dev.yml down -v
```

### Environment Variables for CI

Set in your CI environment:

```bash
CI=true                    # Enables stricter checks
VIEWPORT_NAME=desktop      # or "mobile" for mobile tests
PLAYWRIGHT_RETRIES=2       # Auto-retry flaky tests
```

---

## Best Practices

### ✅ DO

- **Use fixtures** for user setup instead of manual signup in every test
- **Use Page Objects** to encapsulate selectors and interactions
- **Wait for specific conditions** instead of arbitrary timeouts
- **Test user workflows**, not implementation details
- **Use API helpers** for fast test setup when UI interaction isn't required
- **Isolate tests** - each test should be independent
- **Add descriptive test names** - explain what's being tested

### ❌ DON'T

- Hard-code user credentials that might conflict across tests
- Use `waitForTimeout()` - use `expect().toBeVisible()` instead
- Test internal state or private APIs
- Share state between tests (use fixtures for isolated contexts)
- Skip cleanup (fixtures handle this automatically)
- Assume specific timing - always wait for conditions

---

## Next Steps

### Planned Improvements

- [ ] Add `data-testid` attributes to critical UI elements
- [ ] Performance benchmarks (page load, message send time)
- [ ] Visual regression testing (Percy, Playwright snapshots)
- [ ] Accessibility testing (axe-core integration)
- [ ] Cross-browser testing (Firefox, Safari)
- [ ] Load testing (concurrent users, message throughput)

### Contributing

When adding new tests:

1. **Follow existing patterns** - use fixtures and page objects
2. **Keep tests focused** - one behavior per test
3. **Update this README** if adding new patterns or fixtures
4. **Ensure tests pass locally** before pushing
5. **Add comments** for complex test logic

---

## Questions?

- **Issues with tests?** Check [Troubleshooting](#troubleshooting)
- **New feature needs tests?** See [Common Patterns](#common-patterns)
- **CI failures?** See [CI/CD Integration](#cicd-integration)

Happy testing! 🎭✅
