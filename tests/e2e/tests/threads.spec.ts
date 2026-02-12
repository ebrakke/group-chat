import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import { ThreadPanel } from '../pages/ThreadPanel';

test.describe('Threads', () => {
  test.beforeEach(async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Send a message to start threads on
    await chatPage.messageInput.fill('Thread starter');
    await chatPage.sendButton.click();
    
    await expect(page.locator('.prose', { hasText: 'Thread starter' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('User starts a thread on a message', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Hover over the message
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    
    // Click reply/thread button
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    // Thread panel should open
    await expect(threadPanel.panel).toBeVisible({ timeout: 5000 });
    
    // Should show original message
    const panelContent = await threadPanel.panel.textContent();
    expect(panelContent).toContain('Thread starter');
    
    // Should have reply input
    await expect(threadPanel.replyInput).toBeVisible();
  });

  test('User replies in a thread', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    await expect(threadPanel.panel).toBeVisible();
    
    // Send reply
    await threadPanel.sendReply('This is a reply');
    
    // Reply should appear in thread panel
    await expect(
      threadPanel.panel.locator('.prose', { hasText: 'This is a reply' })
    ).toBeVisible({ timeout: 5000 });
    
    // Original message should show "1 reply" indicator
    const replyIndicator = messageContainer.locator('text=/1\\s+repl(y|ies)/i');
    await expect(replyIndicator).toBeVisible({ timeout: 5000 });
  });

  test('Multiple replies show in thread', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    // Send three replies
    const replies = ['Reply 1', 'Reply 2', 'Reply 3'];
    for (const reply of replies) {
      await threadPanel.replyInput.fill(reply);
      await threadPanel.sendButton.click();
      await page.waitForTimeout(200);
    }
    
    // All should appear in order
    for (const reply of replies) {
      await expect(
        threadPanel.panel.locator('.prose', { hasText: reply })
      ).toBeVisible();
    }
    
    // Should show "3 replies"
    const replyIndicator = messageContainer.locator('text=/3\\s+repl(y|ies)/i');
    await expect(replyIndicator).toBeVisible({ timeout: 5000 });
  });

  test('Reply with "Also send to channel" checked', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    await expect(threadPanel.panel).toBeVisible();
    
    // Check "Also send to channel" if not already checked
    const checkbox = threadPanel.alsoSendToChannelCheckbox;
    if (await checkbox.isVisible() && !(await checkbox.isChecked())) {
      await checkbox.check();
    }
    
    // Send reply
    const replyContent = 'Shared reply';
    await threadPanel.replyInput.fill(replyContent);
    await threadPanel.sendButton.click();
    
    // Should appear in thread
    await expect(
      threadPanel.panel.locator('.prose', { hasText: replyContent })
    ).toBeVisible({ timeout: 5000 });
    
    // Should also appear in main channel
    await expect(
      page.locator('.flex.gap-3.group .prose', { hasText: replyContent }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Reply without "Also send to channel"', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    await expect(threadPanel.panel).toBeVisible();
    
    // Ensure checkbox is unchecked
    const checkbox = threadPanel.alsoSendToChannelCheckbox;
    if (await checkbox.isVisible() && await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
    
    // Send reply
    const replyContent = 'Thread-only reply';
    await threadPanel.replyInput.fill(replyContent);
    await threadPanel.sendButton.click();
    
    // Should appear in thread
    await expect(
      threadPanel.panel.locator('.prose', { hasText: replyContent })
    ).toBeVisible({ timeout: 5000 });
    
    // Should NOT appear in main channel (excluding thread panel)
    // Close thread first to check main channel
    const closeBtn = threadPanel.panel.locator('button:has-text("Close"), button[aria-label*="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
    
    // Check main message list doesn't have the thread-only reply
    const mainMessages = page.locator('.flex.gap-3.group .prose', { hasText: replyContent });
    await expect(mainMessages).toHaveCount(0);
  });

  test('Close thread panel', async ({ memberUser }) => {
    const { page } = memberUser;
    const threadPanel = new ThreadPanel(page);
    
    // Open thread
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: 'Thread starter' }).first();
    await messageContainer.hover();
    const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
    await replyBtn.click();
    
    await expect(threadPanel.panel).toBeVisible();
    
    // Close it
    const closeBtn = threadPanel.panel.locator('button:has-text("Close"), button[aria-label*="Close"]').first();
    await closeBtn.click();
    
    // Panel should be gone
    await expect(threadPanel.panel).toHaveCount(0, { timeout: 5000 });
  });

  test('Thread panel shows on mobile as full screen', async ({ browser, api }) => {
    // Create a mobile context
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    
    const page = await context.newPage();
    
    // Create and login user
    const username = 'mobileuser' + Date.now();
    const { token, user } = await api.signup(username, 'Mobile User', 'testpass123');
    
    await page.goto('http://localhost:3002');
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
    
    await page.goto('http://localhost:3002');
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
    
    // Thread panel should take full screen (check viewport usage)
    const threadPanel = new ThreadPanel(page);
    await expect(threadPanel.panel).toBeVisible();
    
    // Should see a back button
    const backBtn = page.locator('button:has-text("Back"), button[aria-label*="Back"]').first();
    await expect(backBtn).toBeVisible();
    
    await context.close();
  });

  test('Thread reply appears in real-time', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Admin sends a message
    const chatPageAdmin = new ChatPage(admin.page);
    await chatPageAdmin.messageInput.fill('RT Thread starter');
    await chatPageAdmin.sendButton.click();
    
    // Member sees it
    await expect(
      member.page.locator('.prose', { hasText: 'RT Thread starter' }).first()
    ).toBeVisible({ timeout: 5000 });
    
    // Both open the thread
    for (const user of [admin, member]) {
      const messageContainer = user.page.locator('.flex.gap-3.group', { hasText: 'RT Thread starter' }).first();
      await messageContainer.hover();
      const replyBtn = messageContainer.locator('button:has-text("Reply"), button:has-text("Thread"), button[title*="Reply"]').first();
      await replyBtn.click();
      
      const threadPanel = new ThreadPanel(user.page);
      await expect(threadPanel.panel).toBeVisible();
    }
    
    // Admin replies
    const threadPanelAdmin = new ThreadPanel(admin.page);
    await threadPanelAdmin.sendReply("Admin's reply");
    
    // Member should see it appear without refresh
    const threadPanelMember = new ThreadPanel(member.page);
    await expect(
      threadPanelMember.panel.locator('.prose', { hasText: "Admin's reply" })
    ).toBeVisible({ timeout: 5000 });
  });
});
