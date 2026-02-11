# Relay Chat E2E Test Guide

Quick reference for running and writing tests.

## Running Tests

### Start Dev Environment First!

```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
docker compose -f docker-compose.dev.yml up -d --build

# Wait for services to be ready
curl http://localhost:3002  # Frontend
curl http://localhost:4002/health  # API
```

### Run All Tests

```bash
cd tests/e2e
npm test
```

### Run Specific Tests

```bash
# Single file
npm test -- tests/auth.spec.ts

# Specific test by name
npm test -- -g "should sign up first user"

# Multiple files
npm test -- tests/auth.spec.ts tests/messaging.spec.ts
```

### Debug Tests

```bash
# Interactive UI mode
npm run test:ui

# Debug mode with browser DevTools
npm run test:debug

# Headed mode (see browser)
npm run test:headed

# Slowmo (slow down actions)
npm test -- --headed --slowMo=1000
```

## Writing Tests

### Template: Simple Test

```typescript
import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Feature Name', () => {
  test('should do something', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    await chat.sendMessage('Hello');
    await expect(adminUser.page.locator('text=Hello')).toBeVisible();
  });
});
```

### Template: Real-time Test (Two Users)

```typescript
import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Real-time', () => {
  test('should sync between users', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const memberChat = new ChatPage(twoUsers.member.page);
    
    // Admin does something
    await adminChat.sendMessage('From admin');
    
    // Member sees it
    await expect(
      twoUsers.member.page.locator('text=From admin')
    ).toBeVisible({ timeout: 5000 });
  });
});
```

### Template: Using API for Setup

```typescript
import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('With Setup', () => {
  test('should test feature', async ({ adminUser, api }) => {
    // Setup via API (faster than UI)
    const channel = await api.createChannel(
      adminUser.token,
      'test-channel',
      'Description'
    );
    
    // Test UI
    const chat = new ChatPage(adminUser.page);
    await chat.switchChannel('test-channel');
    await chat.sendMessage('Test');
  });
});
```

## Available Fixtures

### User Fixtures

```typescript
// Single admin user (first user, has admin privileges)
test('test', async ({ adminUser }) => {
  adminUser.page      // Playwright Page
  adminUser.token     // Auth token
  adminUser.user      // User object
  adminUser.username  // Username
  adminUser.password  // Password
  adminUser.api       // API helper
});

// Single member user (signed up via invite)
test('test', async ({ memberUser }) => {
  // Same properties as adminUser
});

// Two users for real-time testing
test('test', async ({ twoUsers }) => {
  twoUsers.admin    // AdminUser context
  twoUsers.member   // MemberUser context
});
```

### Helper Fixtures

```typescript
// API helper (for direct backend calls)
test('test', async ({ api }) => {
  await api.signup(username, displayName, password, inviteCode?)
  await api.login(username, password)
  await api.createInvite(token)
  await api.createChannel(token, name, description)
  await api.deleteChannel(token, channelId)
  await api.sendMessage(token, channelId, content, attachments?)
  await api.sendThreadReply(token, messageId, content)
  await api.getUser(token)
});

// Auth helper (for UI-based auth flows)
test('test', async ({ auth, page }) => {
  await auth.signup(username, displayName, password)
  await auth.login(username, password)
  await auth.logout()
  await auth.setAuthToken(token, user)
  await auth.clearAuth()
});
```

## Available Page Objects

### ChatPage

```typescript
const chat = new ChatPage(page);

// Messaging
await chat.sendMessage(content)
await chat.waitForMessage(content, timeout?)
await chat.editMessage(originalContent, newContent)
await chat.deleteMessage(content)

// Channels
await chat.switchChannel(channelName)
await chat.getChannelNames()
await chat.openCreateChannelModal()

// Threads
await chat.openThread(messageContent)
await chat.getThreadCount(messageContent)

// Reactions
await chat.addReaction(messageContent, emoji)
await chat.toggleReaction(messageContent, emoji)
await chat.getReactionCount(messageContent, emoji)

// Files
await chat.uploadFile(filePath)
await chat.hasImagePreview(filename)
await chat.hasDownloadLink(filename)

// Helpers
await chat.hoverMessage(content)
await chat.getMessages()
```

### ThreadPanel

```typescript
const thread = new ThreadPanel(page);

await thread.sendReply(content, alsoSendToChannel?)
await thread.close()
await thread.waitForReply(content, timeout?)
await thread.isVisible()
await thread.getParentContent()
await thread.getReplies()
await thread.getReplyCount()
```

### ChannelModal

```typescript
const modal = new ChannelModal(page);

await modal.createChannel(name, description?)
await modal.editChannel(name?, description?)
await modal.deleteChannel()
await modal.cancel()
await modal.isVisible()
```

### LoginPage

```typescript
const login = new LoginPage(page);

await login.goto()
await login.login(username, password)
await login.loginAndWaitForChat(username, password)
await login.hasError()
await login.getErrorMessage()
await login.goToSignup()
```

### SignupPage

```typescript
const signup = new SignupPage(page);

await signup.goto(inviteCode?)
await signup.gotoFirstUserSignup()
await signup.signup(username, displayName, password, inviteCode?)
await signup.signupAndWaitForChat(username, displayName, password, inviteCode?)
await signup.hasError()
await signup.getErrorMessage()
await signup.goToLogin()
```

## Common Patterns

### Unique Identifiers

Always use unique IDs to avoid test collisions:

```typescript
import { generateUsername } from '../fixtures';

const username = generateUsername('test'); // test_1234567890_123
const message = `Test message ${Date.now()}`;
const channelName = `chan${Date.now()}`;
```

### Waiting for Elements

```typescript
// Wait for element to be visible
await expect(page.locator('text=Hello')).toBeVisible({ timeout: 5000 });

// Wait for element to disappear
await expect(page.locator('text=Hello')).toHaveCount(0, { timeout: 5000 });

// Wait for message using helper
await chat.waitForMessage('Hello');
```

### Handling Dialogs

```typescript
// Accept confirmation
page.once('dialog', dialog => dialog.accept());
await page.click('button:has-text("Delete")');

// Reject confirmation
page.once('dialog', dialog => dialog.dismiss());
```

### Multiple Selectors

```typescript
// Try multiple selectors
const input = page.locator('#username, input[name="username"]');

// Filter by text
const button = page.locator('button').filter({ hasText: 'Submit' });

// Nested selectors
const message = page.locator('.message-container', { hasText: 'Hello' });
```

## Debugging Tips

### Inspect Selectors

```bash
# Open Codegen to inspect elements
npm run test:codegen
```

### Pause Test Execution

```typescript
await page.pause(); // Opens inspector
```

### Screenshots

```typescript
await page.screenshot({ path: 'debug.png', fullPage: true });
```

### Console Logs

```typescript
page.on('console', msg => console.log('BROWSER:', msg.text()));
```

### Trace Viewer

```bash
# After a test fails, open trace
npx playwright show-trace playwright-report/.../trace.zip
```

## CI/CD Integration

Tests are ready for CI. Example:

```yaml
# .forgejo/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Start dev environment
        run: docker compose -f docker-compose.dev.yml up -d --build
      
      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:3002; do sleep 2; done'
          timeout 60 bash -c 'until curl -s http://localhost:4002/health; do sleep 2; done'
      
      - name: Install dependencies
        working-directory: tests/e2e
        run: |
          npm ci
          npx playwright install --with-deps chromium
      
      - name: Run tests
        working-directory: tests/e2e
        run: npm test
      
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/
      
      - name: Cleanup
        if: always()
        run: docker compose -f docker-compose.dev.yml down -v
```

## Performance Tips

1. **Use API for setup** - Create channels, users, messages via API instead of clicking through UI
2. **Skip unnecessary waits** - Page Objects handle waits internally
3. **Run tests serially** - Avoid database conflicts (configured by default)
4. **Clean up resources** - Fixtures handle cleanup automatically
5. **Reuse browser contexts** - Fixtures create contexts once per test

## FAQ

**Q: Tests are slow?**
A: Use API helpers for setup instead of UI interactions. Most time is spent waiting for WebSocket updates.

**Q: Tests are flaky?**
A: Increase timeouts in `playwright.config.ts`. Check for race conditions in real-time tests.

**Q: Can't find element?**
A: Use `npm run test:codegen` to inspect selectors. UI might have changed.

**Q: Multiple tests failing?**
A: Check dev environment is running and healthy. Clear database with `docker compose down -v`.

**Q: Want to add new test?**
A: Copy a similar test, update fixture/POM usage, ensure unique identifiers.

**Q: File upload tests skipped?**
A: Set `BLOSSOM_ENABLED=true` or configure Blossom in dev environment.
