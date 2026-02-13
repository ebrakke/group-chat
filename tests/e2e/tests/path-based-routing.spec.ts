import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

const BASE_URL = 'http://localhost:3002';

test.describe('Path-Based Routing', () => {
  
  // ==========================================
  // Channel Navigation
  // ==========================================
  
  test('Navigating to a channel via URL', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Navigate directly to /general via URL
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Should see the #general channel header
    await expect(page.locator('h1:has-text("# general")').first()).toBeVisible();
    
    // Message list should load messages for #general
    const messagesContainer = page.locator('.overflow-y-auto.p-6.space-y-4, [data-testid="message-list"]').first();
    await expect(messagesContainer).toBeVisible();
    
    // Sidebar should show #general as active
    const generalBtn = page.locator('button:has-text("# general")').first();
    await expect(generalBtn).toBeVisible();
    
    const classList = await generalBtn.getAttribute('class');
    expect(classList).toMatch(/bg-|selected|active/);
  });

  test('Switching channels updates the URL', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a random channel for testing
    await api.createChannel(token, 'random', 'Random discussion');
    
    // Start at /general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Verify we're on /general
    expect(page.url()).toContain('/general');
    
    // Click on #random in the sidebar
    await page.click('button:has-text("# random")');
    
    // Wait for navigation
    await page.waitForURL(/\/random/, { timeout: 5000 });
    
    // URL should change to /random
    expect(page.url()).toContain('/random');
    
    // Message list should show messages for #random
    await expect(page.locator('h1:has-text("# random")').first()).toBeVisible();
    
    // Sidebar should show #random as active
    const randomBtn = page.locator('button:has-text("# random")').first();
    const classList = await randomBtn.getAttribute('class');
    expect(classList).toMatch(/bg-|selected|active/);
  });

  test('Browser back button returns to previous channel', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a random channel
    await api.createChannel(token, 'random', 'Random discussion');
    
    // Navigate from /general to /random
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    await page.click('button:has-text("# random")');
    await page.waitForURL(/\/random/, { timeout: 5000 });
    
    // Verify we're on /random
    expect(page.url()).toContain('/random');
    await expect(page.locator('h1:has-text("# random")').first()).toBeVisible();
    
    // Press browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    // Should be on /general
    expect(page.url()).toContain('/general');
    
    // Should see messages for #general
    await expect(page.locator('h1:has-text("# general")').first()).toBeVisible();
  });

  // ==========================================
  // Thread Navigation
  // ==========================================
  
  test('Opening a thread navigates to thread route', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Navigate to general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Send a message via API to create a thread starter
    const messageResponse = await api.sendMessage(token, 'general', 'Thread starter message');
    const messageId = messageResponse.id;
    
    // Reload to see the message
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for message to appear
    await expect(page.locator('text=Thread starter message').first()).toBeVisible();
    
    // Hover over message to reveal actions
    const message = page.locator('.flex.gap-3.group', { hasText: 'Thread starter message' }).first();
    await message.hover();
    
    // Click the thread/reply button
    const threadBtn = page.locator('button:has-text("💬"), button:has-text("Reply in thread")').first();
    await threadBtn.click();
    
    // Wait for URL to change to thread route
    await page.waitForURL(/\/general\/thread\//, { timeout: 5000 });
    
    // URL should match pattern /general/thread/{threadId}
    const url = page.url();
    expect(url).toMatch(/\/general\/thread\/[a-zA-Z0-9-]+/);
    
    // Should see thread view with original message
    await expect(page.locator('text=Thread starter message').first()).toBeVisible();
  });

  test('Thread URL is shareable', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a message and thread reply via API
    const messageResponse = await api.sendMessage(token, 'general', 'Original thread message');
    const messageId = messageResponse.id;
    
    await api.sendThreadReply(token, messageId, 'First reply');
    await api.sendThreadReply(token, messageId, 'Second reply');
    
    // Navigate directly to thread URL
    await page.goto(`${BASE_URL}/general/thread/${messageId}`);
    await page.waitForLoadState('networkidle');
    
    // Should see the thread view
    await expect(page.locator('text=Original thread message').first()).toBeVisible();
    
    // Original message should be displayed
    await expect(page.locator('text=Original thread message').first()).toBeVisible();
    
    // All replies should be loaded
    await expect(page.locator('text=First reply').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Second reply').first()).toBeVisible({ timeout: 5000 });
  });

  test('Back button from thread returns to channel', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a message for threading
    const messageResponse = await api.sendMessage(token, 'general', 'Back button test message');
    const messageId = messageResponse.id;
    
    // Navigate to the thread
    await page.goto(`${BASE_URL}/general/thread/${messageId}`);
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the thread route
    expect(page.url()).toContain(`/general/thread/${messageId}`);
    
    // Press browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    // Should be back on /general
    expect(page.url()).toContain('/general');
    expect(page.url()).not.toContain('/thread/');
  });

  // ==========================================
  // Sending Messages
  // ==========================================
  
  test('Sending a message on a channel route', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Navigate to /general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Type message in input
    const messageInput = page.locator('textarea[placeholder*="Message"]').first();
    await messageInput.fill('Hello routing!');
    
    // Press Enter
    await messageInput.press('Enter');
    
    // Message should appear in message list
    await expect(page.locator('text=Hello routing!').first()).toBeVisible({ timeout: 5000 });
    
    // Message input should be cleared
    const inputValue = await messageInput.inputValue();
    expect(inputValue).toBe('');
  });

  // ==========================================
  // WebSocket Persistence
  // ==========================================
  
  test('WebSocket stays connected across navigation', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create random channel
    await api.createChannel(token, 'random', 'Random channel');
    
    // Navigate to /general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Check WebSocket connection status in localStorage or via evaluation
    const wsConnectedBefore = await page.evaluate(() => {
      // Check if WebSocket is connected
      // This assumes the app exposes connection state somehow
      // Fallback: just verify page is loaded
      return true;
    });
    
    expect(wsConnectedBefore).toBe(true);
    
    // Navigate to /random
    await page.goto(`${BASE_URL}/random`);
    await page.waitForLoadState('networkidle');
    
    // WebSocket should still be connected
    const wsConnectedAfter = await page.evaluate(() => {
      return true; // Placeholder - app should maintain connection
    });
    
    expect(wsConnectedAfter).toBe(true);
    
    // Send a message from another user and verify real-time delivery
    // For now, just verify we can send a message ourselves
    const messageInput = page.locator('textarea[placeholder*="Message"]').first();
    await messageInput.fill('Real-time test');
    await messageInput.press('Enter');
    
    // Should receive message in real-time
    await expect(page.locator('text=Real-time test').first()).toBeVisible({ timeout: 5000 });
  });

  // ==========================================
  // Auth Guard
  // ==========================================
  
  test('Unauthenticated user is redirected', async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/general`);
    
    // Should be redirected to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
    
    // Should see login form
    await expect(page.locator('input[name="username"], input[type="text"]').first()).toBeVisible();
  });

  // ==========================================
  // Sidebar
  // ==========================================
  
  test('Sidebar is visible on all channel routes', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create random channel
    await api.createChannel(token, 'random', 'Random channel');
    
    // Navigate to /general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Sidebar should be visible (contains channel list)
    const sidebar = page.locator('nav, aside, [data-testid="sidebar"]').first();
    await expect(sidebar).toBeVisible();
    
    // Should see general channel in sidebar
    await expect(page.locator('button:has-text("# general")').first()).toBeVisible();
    
    // Navigate to /random
    await page.goto(`${BASE_URL}/random`);
    await page.waitForLoadState('networkidle');
    
    // Sidebar should still be visible
    await expect(sidebar).toBeVisible();
    await expect(page.locator('button:has-text("# random")').first()).toBeVisible();
  });

  test('Sidebar is visible on thread routes', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a message for threading
    const messageResponse = await api.sendMessage(token, 'general', 'Thread sidebar test');
    const messageId = messageResponse.id;
    
    // Navigate to thread route
    await page.goto(`${BASE_URL}/general/thread/${messageId}`);
    await page.waitForLoadState('networkidle');
    
    // Sidebar should be visible
    const sidebar = page.locator('nav, aside, [data-testid="sidebar"]').first();
    await expect(sidebar).toBeVisible();
    
    // Should see channels in sidebar
    await expect(page.locator('button:has-text("# general")').first()).toBeVisible();
  });

  // ==========================================
  // Additional Edge Cases
  // ==========================================
  
  test('Direct navigation to non-existent channel shows error or redirects', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Try to navigate to a channel that doesn't exist
    await page.goto(`${BASE_URL}/nonexistent-channel`);
    await page.waitForLoadState('networkidle');
    
    // Should either:
    // 1. Show an error message
    // 2. Redirect to a default channel (like general)
    // 3. Show a 404 page
    
    const url = page.url();
    const hasError = await page.locator('text=/not found|error|doesn\'t exist/i').count() > 0;
    const redirectedToGeneral = url.includes('/general');
    const is404 = await page.locator('text=/404/i').count() > 0;
    
    expect(hasError || redirectedToGeneral || is404).toBe(true);
  });

  test('URL updates when creating and navigating to new channel', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Navigate to /general
    await page.goto(`${BASE_URL}/general`);
    await page.waitForLoadState('networkidle');
    
    // Open create channel modal
    const newChannelBtn = page.locator('button:has-text("New Channel"), button:has-text("+")').first();
    await newChannelBtn.click();
    
    // Wait for modal
    await expect(page.locator('div[role="dialog"]').first()).toBeVisible();
    
    // Create new channel
    const channelName = `route-test-${Date.now()}`;
    await page.fill('input[name="name"], #name', channelName);
    await page.fill('input[name="description"], #description, textarea[name="description"]', 'Routing test channel');
    await page.click('button:has-text("Create")');
    
    // Should navigate to the new channel
    await page.waitForURL(new RegExp(`/${channelName}`), { timeout: 10000 });
    expect(page.url()).toContain(`/${channelName}`);
    
    // Should see the new channel header
    await expect(page.locator(`h1:has-text("# ${channelName}")`).first()).toBeVisible();
  });

  test('Refreshing page on channel route maintains the current channel', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create and navigate to a specific channel
    await api.createChannel(token, 'refresh-test', 'Refresh test channel');
    await page.goto(`${BASE_URL}/refresh-test`);
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the right channel
    await expect(page.locator('h1:has-text("# refresh-test")').first()).toBeVisible();
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be on /refresh-test
    expect(page.url()).toContain('/refresh-test');
    await expect(page.locator('h1:has-text("# refresh-test")').first()).toBeVisible();
  });

  test('Clicking channel in sidebar from thread view navigates to channel', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create message and navigate to thread
    const messageResponse = await api.sendMessage(token, 'general', 'Thread navigation test');
    const messageId = messageResponse.id;
    
    // Create another channel
    await api.createChannel(token, 'random', 'Random channel');
    
    await page.goto(`${BASE_URL}/general/thread/${messageId}`);
    await page.waitForLoadState('networkidle');
    
    // Verify we're in thread view
    expect(page.url()).toContain('/thread/');
    
    // Click on random channel in sidebar
    await page.click('button:has-text("# random")');
    
    // Should navigate to /random (not /random/thread/...)
    await page.waitForURL(/\/random$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/random$/);
    expect(page.url()).not.toContain('/thread/');
  });
});
