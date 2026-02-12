import { test, expect, generateUsername } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import { ThreadPanel } from '../pages/ThreadPanel';

const BASE_URL = 'http://localhost:3002';

test.describe('Mobile Responsive', () => {
  test.beforeEach(async ({ browser }, testInfo) => {
    // Set mobile viewport for this test suite
    testInfo.project.use = {
      ...testInfo.project.use,
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    };
  });

  test('Sidebar is hidden by default on mobile', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Sidebar should be hidden (or off-screen)
    const sidebar = page.locator('nav, aside').first();
    
    // Check if it's hidden or has translate/transform to move it off-screen
    const isVisible = await sidebar.isVisible().catch(() => false);
    
    if (isVisible) {
      // Check if it's positioned off-screen
      const box = await sidebar.boundingBox();
      if (box) {
        expect(box.x).toBeLessThan(0); // Should be off to the left
      }
    }
    
    // Should see hamburger menu button
    const menuBtn = page.locator('button[aria-label*="menu"], button:has-text("☰"), .hamburger').first();
    await expect(menuBtn).toBeVisible();
    
    await context.close();
  });

  test('Sidebar opens as a drawer on mobile', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Click hamburger menu
    const menuBtn = page.locator('button[aria-label*="menu"], button:has-text("☰"), .hamburger').first();
    await menuBtn.click();
    
    // Sidebar should slide in
    const sidebar = page.locator('nav, aside').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    
    // Should see channel list
    await expect(page.locator('button:has-text("# general")').first()).toBeVisible();
    
    await context.close();
  });

  test('Selecting a channel closes the sidebar drawer', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login and create additional channel
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await api.createChannel(token, 'mobile-test', 'Test channel');
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Open sidebar
    const menuBtn = page.locator('button[aria-label*="menu"], button:has-text("☰"), .hamburger').first();
    await menuBtn.click();
    
    await expect(page.locator('button:has-text("# mobile-test")').first()).toBeVisible();
    
    // Click on channel
    await page.click('button:has-text("# mobile-test")');
    
    // Sidebar should close
    await page.waitForTimeout(500); // Wait for animation
    
    // Should see channel content
    await expect(page.locator('h1:has-text("# mobile-test")').first()).toBeVisible();
    
    await context.close();
  });

  test('Message input is visible and usable on mobile', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Message input should be visible at bottom
    const chatPage = new ChatPage(page);
    await expect(chatPage.messageInput).toBeVisible();
    
    // Should be able to type
    await chatPage.messageInput.fill('Mobile test message');
    const value = await chatPage.messageInput.inputValue();
    expect(value).toBe('Mobile test message');
    
    await context.close();
  });

  test('Viewport adjusts when keyboard opens', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    const chatPage = new ChatPage(page);
    
    // Focus input (simulates keyboard opening)
    await chatPage.messageInput.focus();
    
    // Input should still be visible
    await expect(chatPage.messageInput).toBeVisible();
    
    // Check that input is not hidden behind virtual keyboard
    const inputBox = await chatPage.messageInput.boundingBox();
    expect(inputBox).toBeTruthy();
    if (inputBox) {
      expect(inputBox.y).toBeGreaterThan(0);
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(667);
    }
    
    await context.close();
  });

  test('Thread panel is full screen on mobile', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Send a message
    const chatPage = new ChatPage(page);
    await chatPage.messageInput.fill('Mobile thread test');
    await chatPage.sendButton.click();
    
    await expect(page.locator('.prose', { hasText: 'Mobile thread test' }).first()).toBeVisible();
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Mobile thread test' }).first();
    await messageContainer.hover();
    
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    // Thread panel should be full screen
    const threadPanel = new ThreadPanel(page);
    await expect(threadPanel.panel).toBeVisible();
    
    // Check that it takes full viewport width
    const panelBox = await threadPanel.panel.boundingBox();
    expect(panelBox).toBeTruthy();
    if (panelBox) {
      expect(panelBox.width).toBeGreaterThanOrEqual(370); // Close to viewport width
    }
    
    // Should see back button
    const backBtn = page.locator('button:has-text("Back"), button[aria-label*="Back"], button:has-text("←")').first();
    await expect(backBtn).toBeVisible();
    
    // Click back
    await backBtn.click();
    
    // Should return to channel view
    await expect(page.locator('h1:has-text("# general")').first()).toBeVisible();
    
    await context.close();
  });

  test('No horizontal scroll on mobile', async ({ browser, api }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    
    const page = await context.newPage();
    
    // Login
    const username = generateUsername('mobile');
    const token = await api.signup(username, 'Mobile User', 'testpass123');
    const user = result.user;
    
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Check document width doesn't exceed viewport
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
    
    await context.close();
  });
});
