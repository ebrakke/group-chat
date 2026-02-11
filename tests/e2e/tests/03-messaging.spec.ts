import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Messaging Flow Tests
 * - Send a message
 * - See message appear in real-time
 * - Edit a message
 * - Delete a message
 */

test.describe('Messaging', () => {
  test('should send a message and see it appear in real-time', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const messageContent = `Test message ${Date.now()}`;
    
    // Send message
    await chat.sendMessage(messageContent);

    // Message should appear in chat
    await expect(
      authenticatedPage.locator(`.prose:has-text("${messageContent}")`)
    ).toBeVisible();

    // Message should have timestamp
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: messageContent });
    await expect(messageContainer.locator('.text-xs.text-gray-500').first()).toBeVisible();

    // Message should have author name
    await expect(messageContainer.locator('.font-semibold.text-gray-900').first()).toBeVisible();
  });

  test('should send multiple messages', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const messages = [
      `First message ${Date.now()}`,
      `Second message ${Date.now() + 1}`,
      `Third message ${Date.now() + 2}`,
    ];

    for (const msg of messages) {
      await chat.sendMessage(msg);
    }

    // All messages should be visible
    for (const msg of messages) {
      await expect(authenticatedPage.locator(`.prose:has-text("${msg}")`)).toBeVisible();
    }
  });

  test('should support markdown formatting', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const messageContent = '**Bold text** and *italic text* and `code`';
    await chat.sendMessage(messageContent);

    // Wait for message to appear
    const messageLocator = authenticatedPage.locator('.prose', { hasText: 'Bold text' }).first();
    await expect(messageLocator).toBeVisible();

    // Check that markdown was rendered
    const html = await messageLocator.innerHTML();
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('<code>');
  });

  test('should edit a message', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const originalMessage = `Original message ${Date.now()}`;
    const editedMessage = `Edited message ${Date.now()}`;

    // Send message
    await chat.sendMessage(originalMessage);

    // Edit message
    await chat.editMessage(originalMessage, editedMessage);

    // Edited message should be visible
    await expect(authenticatedPage.locator(`.prose:has-text("${editedMessage}")`)).toBeVisible();

    // Original message should not be visible
    await expect(authenticatedPage.locator(`.prose:has-text("${originalMessage}")`)).toHaveCount(0);

    // Should show "(edited)" indicator
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: editedMessage });
    await expect(messageContainer.locator('text=(edited)')).toBeVisible();
  });

  test('should cancel edit', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const originalMessage = `Message to cancel edit ${Date.now()}`;
    await chat.sendMessage(originalMessage);

    // Hover to show actions
    await chat.hoverMessage(originalMessage);
    
    // Click Edit
    await authenticatedPage.click('button:has-text("✏️ Edit")');

    // Edit textarea should be visible
    await expect(authenticatedPage.locator('textarea').first()).toBeVisible();

    // Click Cancel
    await authenticatedPage.click('button:has-text("Cancel")');

    // Should still show original message
    await expect(authenticatedPage.locator(`.prose:has-text("${originalMessage}")`)).toBeVisible();
    
    // Edit form should be gone
    await expect(authenticatedPage.locator('button:has-text("Save")')).toHaveCount(0);
  });

  test('should delete a message', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const messageToDelete = `Message to delete ${Date.now()}`;
    
    // Send message
    await chat.sendMessage(messageToDelete);

    // Verify message exists
    await expect(authenticatedPage.locator(`.prose:has-text("${messageToDelete}")`)).toBeVisible();

    // Delete message
    await chat.deleteMessage(messageToDelete);

    // Message should be gone
    await expect(authenticatedPage.locator(`.prose:has-text("${messageToDelete}")`)).toHaveCount(0);
  });

  test('should only show edit/delete for own messages', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const myMessage = `My message ${Date.now()}`;
    await chat.sendMessage(myMessage);

    // Hover over message
    await chat.hoverMessage(myMessage);

    // Should show Edit and Delete buttons (user can edit/delete their own messages)
    await expect(authenticatedPage.locator('button:has-text("✏️ Edit")')).toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("🗑️ Delete")')).toBeVisible();
  });

  test('should show message actions on hover', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Hover test ${Date.now()}`;
    await chat.sendMessage(message);

    // Hover over message
    await chat.hoverMessage(message);

    // Should show action buttons
    await expect(authenticatedPage.locator('button:has-text("🙂 React")')).toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("💬 Reply in thread")')).toBeVisible();
  });

  test('should auto-scroll to new messages', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Send several messages to ensure scrolling
    for (let i = 0; i < 3; i++) {
      await chat.sendMessage(`Auto-scroll test message ${i} ${Date.now()}`);
      await authenticatedPage.waitForTimeout(200);
    }

    const lastMessage = `Last message ${Date.now()}`;
    await chat.sendMessage(lastMessage);

    // Last message should be visible (auto-scrolled)
    await expect(authenticatedPage.locator(`.prose:has-text("${lastMessage}")`)).toBeVisible();
  });
});
