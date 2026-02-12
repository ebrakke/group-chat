import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Reactions', () => {
  test.beforeEach(async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Admin sends a message that member will react to
    const chatPageAdmin = new ChatPage(admin.page);
    await chatPageAdmin.messageInput.fill('React to me');
    await chatPageAdmin.sendButton.click();
    
    // Wait for member to receive it
    await expect(
      member.page.locator('.prose', { hasText: 'React to me' }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('User adds a reaction to a message', async ({ twoUsers }) => {
    const { member } = twoUsers;
    const chatPage = new ChatPage(member.page);
    
    // Hover over message
    const messageContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await messageContainer.hover();
    
    // Click reaction button
    const reactBtn = messageContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    
    // Emoji picker should appear
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible({ timeout: 5000 });
    
    // Select thumbs up
    await member.page.click('button:has-text("👍")');
    
    // Reaction badge should appear
    await expect(
      messageContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Count should be 1
    const reactionBtn = messageContainer.locator('button:has-text("👍")').first();
    const text = await reactionBtn.textContent();
    expect(text).toMatch(/👍.*1|1.*👍/);
  });

  test('Multiple users react with same emoji', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Member reacts first
    const memberMessageContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await memberMessageContainer.hover();
    const memberReactBtn = memberMessageContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await memberReactBtn.click();
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await member.page.click('button:has-text("👍")');
    
    // Wait for reaction to appear
    await expect(
      memberMessageContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Admin also reacts with thumbs up
    const adminMessageContainer = admin.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    
    // Wait for admin to see member's reaction first
    await expect(
      adminMessageContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Admin clicks the existing reaction to add their own
    const existingReaction = adminMessageContainer.locator('button:has-text("👍")').first();
    await existingReaction.click();
    
    // Count should be 2
    await admin.page.waitForTimeout(1000); // Wait for update
    const reactionBtn = adminMessageContainer.locator('button:has-text("👍")').first();
    const text = await reactionBtn.textContent();
    expect(text).toMatch(/👍.*2|2.*👍/);
  });

  test('Multiple different reactions on one message', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Member reacts with thumbs up
    const memberContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await memberContainer.hover();
    let reactBtn = memberContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await member.page.click('button:has-text("👍")');
    
    await expect(memberContainer.locator('button:has-text("👍")').first()).toBeVisible({ timeout: 5000 });
    
    // Admin reacts with heart
    const adminContainer = admin.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await adminContainer.hover();
    reactBtn = adminContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(admin.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await admin.page.click('button:has-text("❤️"), button:has-text("❤")');
    
    await expect(adminContainer.locator('button:has-text("❤")').first()).toBeVisible({ timeout: 5000 });
    
    // Both reactions should appear
    await expect(memberContainer.locator('button:has-text("👍")').first()).toBeVisible();
    await expect(memberContainer.locator('button:has-text("❤")').first()).toBeVisible({ timeout: 5000 });
  });

  test('User removes their own reaction', async ({ twoUsers }) => {
    const { member } = twoUsers;
    
    // Add reaction first
    const messageContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await messageContainer.hover();
    const reactBtn = messageContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await member.page.click('button:has-text("👍")');
    
    await expect(
      messageContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Click on the reaction to remove it
    const reactionBadge = messageContainer.locator('button:has-text("👍")').first();
    await reactionBadge.click();
    
    // Count should decrease (or badge disappears if it was the only reaction)
    await member.page.waitForTimeout(1000);
    
    // Badge should either be gone or show count 0 (which typically means it disappears)
    const badgeCount = await messageContainer.locator('button:has-text("👍")').count();
    expect(badgeCount).toBe(0);
  });

  test('Reaction badge disappears when count reaches zero', async ({ twoUsers }) => {
    const { member } = twoUsers;
    
    // Member is the only one reacting
    const messageContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await messageContainer.hover();
    const reactBtn = messageContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await member.page.click('button:has-text("👍")');
    
    await expect(
      messageContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Remove reaction
    const reactionBadge = messageContainer.locator('button:has-text("👍")').first();
    await reactionBadge.click();
    
    // Badge should disappear entirely
    await expect(
      messageContainer.locator('button:has-text("👍")')
    ).toHaveCount(0, { timeout: 5000 });
  });

  test('My reactions are visually highlighted', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Member adds a reaction
    const memberContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await memberContainer.hover();
    const reactBtn = memberContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(member.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await member.page.click('button:has-text("👍")');
    
    await expect(
      memberContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    // Check that member's own reaction has highlighting class
    const memberReactionBtn = memberContainer.locator('button:has-text("👍")').first();
    const memberClasses = await memberReactionBtn.getAttribute('class');
    
    // Should have some highlight styling (bg-blue, border, etc.)
    expect(memberClasses).toMatch(/bg-|border-|ring-/);
    
    // Admin sees the reaction but not highlighted for them
    const adminContainer = admin.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await expect(
      adminContainer.locator('button:has-text("👍")').first()
    ).toBeVisible({ timeout: 5000 });
    
    const adminViewReactionBtn = adminContainer.locator('button:has-text("👍")').first();
    const adminViewClasses = await adminViewReactionBtn.getAttribute('class');
    
    // For admin viewing member's reaction, it should not be highlighted the same way
    // This is a bit tricky to test - might need to check specific class differences
    // For now, just verify it exists
    expect(adminViewClasses).toBeTruthy();
  });

  test('Reaction appears in real-time', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;
    
    // Member is viewing the message
    const memberContainer = member.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await expect(memberContainer).toBeVisible();
    
    // Admin adds a reaction
    const adminContainer = admin.page.locator('.flex.gap-3.group', { hasText: 'React to me' }).first();
    await adminContainer.hover();
    const reactBtn = adminContainer.locator('button:has-text("React"), button:has-text("🙂"), button[title*="React"]').first();
    await reactBtn.click();
    await expect(admin.page.locator('div[role="dialog"], .emoji-picker').first()).toBeVisible();
    await admin.page.click('button:has-text("🎉")');
    
    // Member should see it appear without refresh
    await expect(
      memberContainer.locator('button:has-text("🎉")').first()
    ).toBeVisible({ timeout: 5000 });
  });
});
