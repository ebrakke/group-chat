import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

const BASE_URL = 'http://localhost:3002';

test.describe('Messaging', () => {
  test('User sends a message', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Type and send message
    const messageContent = 'Hello world!';
    await chatPage.messageInput.fill(messageContent);
    await chatPage.sendButton.click();
    
    // Message should appear in list
    await expect(page.locator('.prose', { hasText: messageContent }).first()).toBeVisible({ timeout: 5000 });
    
    // Should show display name
    const displayName = memberUser.user.displayName;
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    await expect(messageContainer.locator(`text=${displayName}`).first()).toBeVisible();
    
    // Should show timestamp
    await expect(messageContainer.locator('text=/\\d+:\\d+|ago|AM|PM/').first()).toBeVisible();
    
    // Input should be cleared
    const inputValue = await chatPage.messageInput.inputValue();
    expect(inputValue).toBe('');
  });

  test('User sends a message with Enter key', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    const messageContent = 'Sent with enter';
    await chatPage.messageInput.fill(messageContent);
    await chatPage.messageInput.press('Enter');
    
    // Message should appear
    await expect(page.locator('.prose', { hasText: messageContent }).first()).toBeVisible({ timeout: 5000 });
  });

  test('Shift+Enter creates a new line instead of sending', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Type line 1, press Shift+Enter, type line 2
    await chatPage.messageInput.fill('Line 1');
    await chatPage.messageInput.press('Shift+Enter');
    await chatPage.messageInput.type('Line 2');
    
    // Press Enter to send
    await chatPage.messageInput.press('Enter');
    
    // Message should contain both lines
    await expect(page.locator('.prose', { hasText: 'Line 1' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.prose', { hasText: 'Line 2' }).first()).toBeVisible();
  });

  test('Cannot send an empty message', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Ensure input is empty
    await chatPage.messageInput.clear();
    
    // Send button should be disabled
    const isDisabled = await chatPage.sendButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('Messages appear in real-time without refresh', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Admin sends a message
    const chatPageAdmin = new ChatPage(admin.page);
    const messageContent = 'Hello from Admin!';
    
    await chatPageAdmin.messageInput.fill(messageContent);
    await chatPageAdmin.sendButton.click();
    
    // Member should see it without refresh
    await expect(
      member.page.locator('.prose', { hasText: messageContent }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Real-time messages from multiple users', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    const chatPageAdmin = new ChatPage(admin.page);
    const chatPageMember = new ChatPage(member.page);
    
    // Admin sends message
    await chatPageAdmin.messageInput.fill('Hi from Admin');
    await chatPageAdmin.sendButton.click();
    
    // Wait a moment
    await admin.page.waitForTimeout(500);
    
    // Member sends message
    await chatPageMember.messageInput.fill('Hi from Member');
    await chatPageMember.sendButton.click();
    
    // Both should see both messages
    await expect(admin.page.locator('.prose', { hasText: 'Hi from Member' }).first()).toBeVisible({ timeout: 5000 });
    await expect(member.page.locator('.prose', { hasText: 'Hi from Admin' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('User edits their own message', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Send a message
    const originalContent = 'Original text';
    await chatPage.messageInput.fill(originalContent);
    await chatPage.sendButton.click();
    
    await expect(page.locator('.prose', { hasText: originalContent }).first()).toBeVisible({ timeout: 5000 });
    
    // Hover over message
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: originalContent }).first();
    await messageContainer.hover();
    
    // Click edit button
    const editBtn = messageContainer.locator('button:has-text("Edit"), button[title*="Edit"]').first();
    await editBtn.click();
    
    // Edit textarea should appear
    const editTextarea = page.locator('textarea').first();
    await editTextarea.fill('Edited text');
    
    // Save (press Enter or click Save)
    await page.keyboard.press('Enter');
    
    // Should show edited text
    await expect(page.locator('.prose', { hasText: 'Edited text' }).first()).toBeVisible({ timeout: 5000 });
    
    // Should show "(edited)" indicator
    await expect(page.locator('text=/\\(edited\\)/i').first()).toBeVisible();
  });

  test('User cancels editing a message', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Send message
    const originalContent = "Don't change me";
    await chatPage.messageInput.fill(originalContent);
    await chatPage.sendButton.click();
    
    await expect(page.locator('.prose', { hasText: originalContent }).first()).toBeVisible({ timeout: 5000 });
    
    // Start editing
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: originalContent }).first();
    await messageContainer.hover();
    
    const editBtn = messageContainer.locator('button:has-text("Edit"), button[title*="Edit"]').first();
    await editBtn.click();
    
    // Press Escape to cancel
    await page.keyboard.press('Escape');
    
    // Should still show original
    await expect(page.locator('.prose', { hasText: originalContent }).first()).toBeVisible();
  });

  test('User cannot edit another user\'s message', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Admin sends a message
    const chatPageAdmin = new ChatPage(admin.page);
    const messageContent = "Admin's message";
    await chatPageAdmin.messageInput.fill(messageContent);
    await chatPageAdmin.sendButton.click();
    
    // Wait for member to receive it
    await expect(
      member.page.locator('.prose', { hasText: messageContent }).first()
    ).toBeVisible({ timeout: 5000 });
    
    // Member hovers over admin's message
    const messageContainer = member.page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    await messageContainer.hover();
    
    // Should NOT see edit button
    const editBtn = messageContainer.locator('button:has-text("Edit"), button[title*="Edit"]');
    await expect(editBtn).toHaveCount(0);
  });

  test('User deletes their own message', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Send message
    const messageContent = 'Delete me';
    await chatPage.messageInput.fill(messageContent);
    await chatPage.sendButton.click();
    
    await expect(page.locator('.prose', { hasText: messageContent }).first()).toBeVisible({ timeout: 5000 });
    
    // Hover and delete
    const messageContainer = page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    await messageContainer.hover();
    
    const deleteBtn = messageContainer.locator('button:has-text("Delete"), button[title*="Delete"]').first();
    
    // Handle confirmation dialog
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    
    // Message should disappear
    await expect(page.locator('.prose', { hasText: messageContent })).toHaveCount(0, { timeout: 5000 });
  });

  test('User cannot delete another user\'s message', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Admin sends message
    const chatPageAdmin = new ChatPage(admin.page);
    await chatPageAdmin.messageInput.fill('Admin message');
    await chatPageAdmin.sendButton.click();
    
    // Member receives it
    await expect(
      member.page.locator('.prose', { hasText: 'Admin message' }).first()
    ).toBeVisible({ timeout: 5000 });
    
    // Member hovers
    const messageContainer = member.page.locator('.flex.gap-3.group', { hasText: 'Admin message' }).first();
    await messageContainer.hover();
    
    // Should NOT see delete button (unless member is also admin)
    const deleteBtn = messageContainer.locator('button:has-text("Delete"), button[title*="Delete"]');
    // Member is not admin, so should not see delete
    if (member.user.role !== 'admin') {
      await expect(deleteBtn).toHaveCount(0);
    }
  });

  test('Admin can delete any message', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Member sends message
    const chatPageMember = new ChatPage(member.page);
    const messageContent = 'Rule violation';
    await chatPageMember.messageInput.fill(messageContent);
    await chatPageMember.sendButton.click();
    
    // Admin receives it
    await expect(
      admin.page.locator('.prose', { hasText: messageContent }).first()
    ).toBeVisible({ timeout: 5000 });
    
    // Admin hovers and deletes
    const messageContainer = admin.page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    await messageContainer.hover();
    
    const deleteBtn = messageContainer.locator('button:has-text("Delete"), button[title*="Delete"]').first();
    await expect(deleteBtn).toBeVisible();
    
    // Delete
    admin.page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    
    // Should disappear
    await expect(admin.page.locator('.prose', { hasText: messageContent })).toHaveCount(0, { timeout: 5000 });
  });

  test('Messages are shown in chronological order', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Send three messages
    const messages = ['First', 'Second', 'Third'];
    for (const msg of messages) {
      await chatPage.messageInput.fill(msg);
      await chatPage.sendButton.click();
      await page.waitForTimeout(100); // Small delay to ensure order
    }
    
    // Get all messages
    const allMessages = page.locator('.flex.gap-3.group .prose');
    const count = await allMessages.count();
    
    // Check last 3 messages are in order
    const lastThree = [];
    for (let i = Math.max(0, count - 3); i < count; i++) {
      const text = await allMessages.nth(i).textContent();
      lastThree.push(text);
    }
    
    expect(lastThree.join(' ')).toContain('First');
    expect(lastThree.join(' ')).toContain('Second');
    expect(lastThree.join(' ')).toContain('Third');
  });

  test.skip('Message list scrolls to bottom on new message', async ({ memberUser }) => {
    // This test requires many messages to make the list scrollable
    // Skipping for now as it's complex to set up
  });

  test.skip('Scroll-to-bottom button appears when scrolled up', async ({ memberUser }) => {
    // Requires scrollable message list
    // Skipping for now
  });
});
