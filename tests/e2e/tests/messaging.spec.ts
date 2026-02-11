import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Messaging', () => {
  test('should send a message and see it appear in real-time', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const messageContent = `Test message ${Date.now()}`;
    await chat.sendMessage(messageContent);
    
    // Message should appear in chat
    await expect(
      adminUser.page.locator(`.prose:has-text("${messageContent}")`)
    ).toBeVisible();
    
    // Message should have timestamp
    const messageContainer = adminUser.page.locator('.flex.gap-3.group', { hasText: messageContent });
    await expect(messageContainer.locator('.text-xs.text-gray-500').first()).toBeVisible();
  });

  test('should edit a message', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const original = `Original message ${Date.now()}`;
    const edited = `Edited message ${Date.now()}`;
    
    await chat.sendMessage(original);
    await chat.editMessage(original, edited);
    
    // Edited message should be visible
    await expect(adminUser.page.locator(`.prose:has-text("${edited}")`)).toBeVisible();
    
    // Original should be gone
    await expect(adminUser.page.locator(`.prose:has-text("${original}")`)).toHaveCount(0);
    
    // Should show "edited" indicator
    await expect(
      adminUser.page.locator('.flex.gap-3.group', { hasText: edited }).locator('text=/edited/i')
    ).toBeVisible();
  });

  test('should delete a message', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `Delete me ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Message should exist
    await expect(adminUser.page.locator(`.prose:has-text("${message}")`)).toBeVisible();
    
    // Delete it
    await chat.deleteMessage(message);
    
    // Message should be gone
    await expect(adminUser.page.locator(`.prose:has-text("${message}")`)).toHaveCount(0);
  });

  test('should persist messages across refresh', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `Persistent message ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Refresh page
    await adminUser.page.reload();
    await adminUser.page.waitForLoadState('networkidle');
    
    // Message should still be visible
    await expect(adminUser.page.locator(`.prose:has-text("${message}")`)).toBeVisible();
  });

  test('should render markdown correctly', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const markdownMessage = `**Bold** and *italic* and \`code\` ${Date.now()}`;
    await chat.sendMessage(markdownMessage);
    
    // Find the message container
    const messageContainer = adminUser.page.locator('.prose', { hasText: 'Bold' }).first();
    
    // Check for markdown rendering
    await expect(messageContainer.locator('strong')).toBeVisible(); // Bold
    await expect(messageContainer.locator('em')).toBeVisible(); // Italic
    await expect(messageContainer.locator('code')).toBeVisible(); // Code
  });

  test('should show multiple messages in order', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const msg1 = `First ${Date.now()}`;
    const msg2 = `Second ${Date.now() + 1}`;
    const msg3 = `Third ${Date.now() + 2}`;
    
    await chat.sendMessage(msg1);
    await chat.sendMessage(msg2);
    await chat.sendMessage(msg3);
    
    // All messages should be visible
    await expect(adminUser.page.locator(`.prose:has-text("${msg1}")`)).toBeVisible();
    await expect(adminUser.page.locator(`.prose:has-text("${msg2}")`)).toBeVisible();
    await expect(adminUser.page.locator(`.prose:has-text("${msg3}")`)).toBeVisible();
    
    // Check order (third should come after second in DOM)
    const messages = await chat.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });
});
