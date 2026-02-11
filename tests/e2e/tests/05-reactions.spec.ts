import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Reaction Flow Tests
 * - Add emoji reaction to a message
 * - See reaction appear in real-time
 * - Toggle reactions (remove by clicking again)
 * - Multiple reactions on same message
 */

test.describe('Reactions', () => {
  test('should add an emoji reaction to a message', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `React to this ${Date.now()}`;
    await chat.sendMessage(message);

    // Note: addReaction assumes emoji picker works and has the emoji
    // For a real test, we'll hover and click the react button to trigger emoji picker
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');

    // Emoji picker should appear
    await expect(authenticatedPage.locator('div').filter({ hasText: /😀|😃|😊/ }).first()).toBeVisible({ timeout: 3000 });

    // Click a common emoji (assuming the emoji picker has standard emojis)
    // Let's try clicking the first available emoji button
    const firstEmoji = authenticatedPage.locator('button').filter({ hasText: /^(😀|👍|❤️|😊|🎉)$/ }).first();
    await firstEmoji.click();

    // Reaction should appear on the message
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    await expect(messageContainer.locator('button').filter({ hasText: /^(😀|👍|❤️|😊|🎉)/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test('should toggle reaction on/off', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Toggle reaction ${Date.now()}`;
    await chat.sendMessage(message);

    // Add reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    
    // Click thumbs up emoji
    const thumbsUp = authenticatedPage.locator('button:has-text("👍")').first();
    await thumbsUp.click();

    // Wait for reaction to appear
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    const reactionBtn = messageContainer.locator('button:has-text("👍")').first();
    await expect(reactionBtn).toBeVisible({ timeout: 5000 });

    // Click the reaction to remove it
    await reactionBtn.click();

    // Reaction should be removed (button should disappear or count should be 0)
    await expect(reactionBtn).toHaveCount(0, { timeout: 5000 });
  });

  test('should show reaction count', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Reaction count ${Date.now()}`;
    await chat.sendMessage(message);

    // Add reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    
    const heartEmoji = authenticatedPage.locator('button:has-text("❤️")').first();
    await heartEmoji.click();

    // Reaction button should show count
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    const reactionBtn = messageContainer.locator('button:has-text("❤️")').first();
    await expect(reactionBtn).toBeVisible();

    // Should show count "1"
    await expect(reactionBtn).toContainText('1');
  });

  test('should support multiple different reactions on same message', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Multiple reactions ${Date.now()}`;
    await chat.sendMessage(message);

    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });

    // Add first reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    await authenticatedPage.locator('button:has-text("👍")').first().click();
    
    // Wait for first reaction
    await expect(messageContainer.locator('button:has-text("👍")').first()).toBeVisible({ timeout: 5000 });

    // Add second reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    await authenticatedPage.locator('button:has-text("❤️")').first().click();

    // Both reactions should be visible
    await expect(messageContainer.locator('button:has-text("👍")').first()).toBeVisible();
    await expect(messageContainer.locator('button:has-text("❤️")').first()).toBeVisible();
  });

  test('should highlight user own reactions', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Own reaction highlight ${Date.now()}`;
    await chat.sendMessage(message);

    // Add reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    await authenticatedPage.locator('button:has-text("🎉")').first().click();

    // Reaction button should have highlight styling (bg-blue-100)
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    const reactionBtn = messageContainer.locator('button:has-text("🎉")').first();
    
    await expect(reactionBtn).toBeVisible();
    
    // Check for highlight class
    const classList = await reactionBtn.getAttribute('class');
    expect(classList).toContain('bg-blue-100');
  });

  test('should close emoji picker when clicking outside', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Close picker ${Date.now()}`;
    await chat.sendMessage(message);

    // Open emoji picker
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');

    // Emoji picker should be visible
    const picker = authenticatedPage.locator('div').filter({ hasText: /😀|😃|😊/ }).first();
    await expect(picker).toBeVisible();

    // Click outside (on the message container background)
    await authenticatedPage.locator('main').click({ position: { x: 10, y: 10 } });

    // Picker should close
    await expect(picker).toHaveCount(0, { timeout: 3000 });
  });

  test('should persist reactions after page reload', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    const message = `Persist reaction ${Date.now()}`;
    await chat.sendMessage(message);

    // Add reaction
    await chat.hoverMessage(message);
    await authenticatedPage.click('button:has-text("🙂 React")');
    await authenticatedPage.locator('button:has-text("👍")').first().click();

    // Wait for reaction to appear
    const messageContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    await expect(messageContainer.locator('button:has-text("👍")').first()).toBeVisible();

    // Reload page
    await authenticatedPage.reload();

    // Reaction should still be there
    const reloadedContainer = authenticatedPage.locator('.flex.gap-3.group', { hasText: message });
    await expect(reloadedContainer.locator('button:has-text("👍")').first()).toBeVisible();
  });
});
