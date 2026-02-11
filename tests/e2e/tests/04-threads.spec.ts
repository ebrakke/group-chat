import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Thread Flow Tests
 * - Click reply on a message to open thread panel
 * - Post a thread reply
 * - See thread reply appear in real-time without refresh
 * - Thread count increments
 */

test.describe('Threads', () => {
  test('should open thread panel when clicking reply', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const parentMessage = `Parent message ${Date.now()}`;
    await chat.sendMessage(parentMessage);

    // Open thread
    await chat.openThread(parentMessage);

    // Thread panel should be visible
    await expect(authenticatedPage.locator('aside').last()).toBeVisible();

    // Should show the parent message in thread panel
    await expect(authenticatedPage.locator('aside', { hasText: parentMessage })).toBeVisible();
  });

  test('should post a thread reply and see it appear in real-time', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const parentMessage = `Thread parent ${Date.now()}`;
    const replyMessage = `Thread reply ${Date.now()}`;

    // Send parent message
    await chat.sendMessage(parentMessage);

    // Open thread
    await chat.openThread(parentMessage);

    // Send reply in thread
    await chat.sendThreadReply(replyMessage);

    // Reply should appear in thread panel
    await expect(
      authenticatedPage.locator('aside .prose', { hasText: replyMessage })
    ).toBeVisible();
  });

  test('should increment thread count when reply is added', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const parentMessage = `Thread count test ${Date.now()}`;
    await chat.sendMessage(parentMessage);

    // Initially no thread count
    const initialCount = await chat.getThreadCount(parentMessage);
    expect(initialCount).toBe(0);

    // Open thread and add reply
    await chat.openThread(parentMessage);
    await chat.sendThreadReply(`Reply 1 ${Date.now()}`);

    // Close thread panel to see the updated count in main view
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500); // Wait for UI update

    // Thread count should be 1
    const countAfterOne = await chat.getThreadCount(parentMessage);
    expect(countAfterOne).toBe(1);

    // Add another reply
    await chat.openThread(parentMessage);
    await chat.sendThreadReply(`Reply 2 ${Date.now()}`);
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);

    // Thread count should be 2
    const countAfterTwo = await chat.getThreadCount(parentMessage);
    expect(countAfterTwo).toBe(2);
  });

  test('should show thread count as clickable link', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const parentMessage = `Clickable thread ${Date.now()}`;
    await chat.sendMessage(parentMessage);

    // Add a reply to create thread
    await chat.openThread(parentMessage);
    await chat.sendThreadReply(`First reply ${Date.now()}`);
    
    // Close thread
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);

    // Should show thread link with count
    const threadLink = authenticatedPage.locator(
      `.flex.gap-3.group:has-text("${parentMessage}") button:has-text("reply")`
    );
    await expect(threadLink).toBeVisible();

    // Click the thread link to reopen
    await threadLink.click();

    // Thread panel should open
    await expect(authenticatedPage.locator('aside').last()).toBeVisible();
  });

  test('should close thread panel', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const parentMessage = `Close thread test ${Date.now()}`;
    await chat.sendMessage(parentMessage);

    // Open thread
    await chat.openThread(parentMessage);
    await expect(authenticatedPage.locator('aside').last()).toBeVisible();

    // Close thread
    await authenticatedPage.locator('aside button:has-text("Close")').click();

    // Thread panel should be gone
    await expect(authenticatedPage.locator('aside').last()).toHaveCount(0);
  });

  test('should support multiple threads on different messages', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message1 = `First thread parent ${Date.now()}`;
    const message2 = `Second thread parent ${Date.now() + 1}`;

    // Send two messages
    await chat.sendMessage(message1);
    await chat.sendMessage(message2);

    // Add reply to first message
    await chat.openThread(message1);
    await chat.sendThreadReply(`Reply to first ${Date.now()}`);
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);

    // Add reply to second message
    await chat.openThread(message2);
    await chat.sendThreadReply(`Reply to second ${Date.now()}`);
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);

    // Both should show thread counts
    expect(await chat.getThreadCount(message1)).toBe(1);
    expect(await chat.getThreadCount(message2)).toBe(1);
  });

  test('should maintain thread context when switching', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message1 = `Thread A ${Date.now()}`;
    const message2 = `Thread B ${Date.now() + 1}`;
    const reply1 = `Reply to A ${Date.now()}`;
    const reply2 = `Reply to B ${Date.now()}`;

    // Create two threads
    await chat.sendMessage(message1);
    await chat.sendMessage(message2);

    // Add reply to first thread
    await chat.openThread(message1);
    await chat.sendThreadReply(reply1);

    // Switch to second thread (close first, open second)
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await chat.openThread(message2);
    await chat.sendThreadReply(reply2);

    // Second thread should show correct reply
    await expect(
      authenticatedPage.locator('aside .prose', { hasText: reply2 })
    ).toBeVisible();

    // First reply should not be visible
    await expect(
      authenticatedPage.locator('aside .prose', { hasText: reply1 })
    ).toHaveCount(0);
  });
});
