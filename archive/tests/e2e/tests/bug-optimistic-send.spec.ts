import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Bug Fix Tests: Optimistic Message Display After Send
 * 
 * Tests derived from: bug-optimistic-send.feature
 * 
 * Ensures that:
 * - Messages appear instantly after clicking Send (< 500ms)
 * - No duplicate messages appear when WebSocket confirms
 * - Thread replies appear instantly in thread panel
 */

test.describe('Optimistic Message Display', () => {
  test('should display sent message immediately in the chat', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    const messageContent = `Instant message ${Date.now()}`;
    const startTime = Date.now();
    
    // Type message
    await chat.messageInput.fill(messageContent);
    
    // Click Send button
    await chat.sendButton.click();
    
    // Message should appear within 500ms (optimistic update)
    await expect(
      authenticatedPage.locator(`.prose:has-text("${messageContent}")`)
    ).toBeVisible({ timeout: 500 });
    
    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeLessThan(500);
    
    // Message input should be cleared
    await expect(chat.messageInput).toHaveValue('');
  });

  test('should not duplicate message when WebSocket confirms', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    const messageContent = `No duplicates ${Date.now()}`;
    
    // Send message
    await chat.messageInput.fill(messageContent);
    await chat.sendButton.click();
    
    // Message should appear immediately (optimistic)
    await expect(
      authenticatedPage.locator(`.prose:has-text("${messageContent}")`)
    ).toBeVisible({ timeout: 500 });
    
    // Wait for WebSocket confirmation (give it time to arrive)
    await authenticatedPage.waitForTimeout(2000);
    
    // Message should appear exactly once (no duplicate)
    const messageCount = await authenticatedPage.locator(`.prose:has-text("${messageContent}")`).count();
    expect(messageCount).toBe(1);
  });

  test('should show thread reply immediately in thread panel', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create parent message
    const parentMessage = `Thread parent ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread panel
    await chat.openThread(parentMessage);
    
    // Send thread reply
    const replyContent = `Quick reply ${Date.now()}`;
    const startTime = Date.now();
    
    const threadInput = authenticatedPage.locator('aside textarea').last();
    await threadInput.fill(replyContent);
    
    // Press Enter to send (alternative to clicking Send button)
    await threadInput.press('Enter');
    
    // Reply should appear in thread panel within 500ms
    await expect(
      authenticatedPage.locator('aside .prose', { hasText: replyContent })
    ).toBeVisible({ timeout: 500 });
    
    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeLessThan(500);
  });

  test('should not duplicate thread reply when WebSocket confirms', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create parent message
    const parentMessage = `Thread no duplicates ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread panel
    await chat.openThread(parentMessage);
    
    // Send thread reply
    const replyContent = `Thread reply no dup ${Date.now()}`;
    await chat.sendThreadReply(replyContent);
    
    // Wait for WebSocket confirmation
    await authenticatedPage.waitForTimeout(2000);
    
    // Reply should appear exactly once in thread panel
    const replyCount = await authenticatedPage.locator('aside .prose', { hasText: replyContent }).count();
    expect(replyCount).toBe(1);
  });

  test('should clear message input after optimistic send', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    const messageContent = `Clear input test ${Date.now()}`;
    
    // Type and send
    await chat.messageInput.fill(messageContent);
    await chat.sendButton.click();
    
    // Input should be cleared immediately (before WebSocket confirmation)
    await expect(chat.messageInput).toHaveValue('', { timeout: 200 });
    
    // Message should still be visible (optimistic)
    await expect(
      authenticatedPage.locator(`.prose:has-text("${messageContent}")`)
    ).toBeVisible();
  });

  test('should handle rapid successive sends without duplication', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    const messages = [
      `Rapid 1 ${Date.now()}`,
      `Rapid 2 ${Date.now() + 1}`,
      `Rapid 3 ${Date.now() + 2}`,
    ];
    
    // Send messages rapidly
    for (const msg of messages) {
      await chat.messageInput.fill(msg);
      await chat.sendButton.click();
      // Only wait for optimistic render, not WebSocket
      await authenticatedPage.waitForTimeout(100);
    }
    
    // Wait for all WebSocket confirmations
    await authenticatedPage.waitForTimeout(3000);
    
    // Each message should appear exactly once
    for (const msg of messages) {
      const count = await authenticatedPage.locator(`.prose:has-text("${msg}")`).count();
      expect(count).toBe(1);
    }
  });
});
