import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Reactions', () => {
  test('should add an emoji reaction to a message', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `React to this ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Hover and click react button
    await chat.hoverMessage(message);
    await adminUser.page.click('button:has-text("🙂 React")');
    
    // Emoji picker should appear
    await expect(adminUser.page.locator('div').filter({ hasText: /😀|😃|😊/ }).first()).toBeVisible({ timeout: 3000 });
    
    // Click an emoji (try common ones)
    const emoji = await adminUser.page.locator('button').filter({ hasText: /^(👍|❤️|😊|🎉)$/ }).first();
    const emojiText = await emoji.textContent();
    await emoji.click();
    
    // Reaction should appear on message
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("${emojiText}")`)
    ).toBeVisible({ timeout: 5000 });
  });

  test('should remove reaction by clicking again', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `Toggle reaction ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Add reaction
    await chat.hoverMessage(message);
    await adminUser.page.click('button:has-text("🙂 React")');
    await expect(adminUser.page.locator('div').filter({ hasText: /😀|😃|😊/ }).first()).toBeVisible({ timeout: 3000 });
    
    const emoji = await adminUser.page.locator('button').filter({ hasText: /^(👍)$/ }).first();
    await emoji.click();
    
    // Wait for reaction to appear
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("👍")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Click the reaction to remove it
    await chat.toggleReaction(message, '👍');
    
    // Reaction should disappear (or count goes to 0)
    // Depending on implementation, it might hide completely or show count 0
    await adminUser.page.waitForTimeout(1000); // Give it time to update
    
    const count = await chat.getReactionCount(message, '👍');
    expect(count).toBe(0);
  });

  test('should show reaction count', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `Reaction count test ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Add first reaction
    await chat.hoverMessage(message);
    await adminUser.page.click('button:has-text("🙂 React")');
    await expect(adminUser.page.locator('div').filter({ hasText: /😀|😃|😊/ }).first()).toBeVisible({ timeout: 3000 });
    
    const emoji = await adminUser.page.locator('button').filter({ hasText: /^(❤️)$/ }).first();
    await emoji.click();
    
    // Wait for reaction
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("❤️")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Check count (should be 1 from current user)
    const count = await chat.getReactionCount(message, '❤️');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should support multiple different reactions on same message', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    const message = `Multiple reactions ${Date.now()}`;
    await chat.sendMessage(message);
    
    // Add first reaction
    await chat.hoverMessage(message);
    await adminUser.page.click('button:has-text("🙂 React")');
    await adminUser.page.locator('button:has-text("👍")').first().click();
    
    // Wait for first reaction
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("👍")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Add second reaction
    await chat.hoverMessage(message);
    await adminUser.page.click('button:has-text("🙂 React")');
    await adminUser.page.locator('button:has-text("❤️")').first().click();
    
    // Both reactions should be visible
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("👍")`)
    ).toBeVisible();
    await expect(
      adminUser.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("❤️")`)
    ).toBeVisible();
  });
});
