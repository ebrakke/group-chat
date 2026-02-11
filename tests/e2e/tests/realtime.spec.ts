import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import { ChannelModal } from '../pages/ChannelModal';

test.describe('Real-time Communication', () => {
  test('should show message from User A to User B in real-time', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const memberChat = new ChatPage(twoUsers.member.page);
    
    const message = `Real-time message ${Date.now()}`;
    
    // Admin sends message
    await adminChat.sendMessage(message);
    
    // Member should see it immediately
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${message}")`)
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show new channel to other users immediately', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const modal = new ChannelModal(twoUsers.admin.page);
    
    const channelName = `rtchan${Date.now()}`;
    
    // Admin creates channel
    await adminChat.openCreateChannelModal();
    await modal.createChannel(channelName);
    
    // Member should see it in sidebar
    await expect(
      twoUsers.member.page.locator(`button:has-text("# ${channelName}")`)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show edits to other users in real-time', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    
    const original = `Original ${Date.now()}`;
    const edited = `Edited ${Date.now()}`;
    
    // Admin sends message
    await adminChat.sendMessage(original);
    
    // Member sees original
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${original}")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Admin edits message
    await adminChat.editMessage(original, edited);
    
    // Member sees edit
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${edited}")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Original should be gone for member too
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${original}")`)
    ).toHaveCount(0);
  });

  test('should show deletions to other users in real-time', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    
    const message = `To delete ${Date.now()}`;
    
    // Admin sends message
    await adminChat.sendMessage(message);
    
    // Member sees it
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${message}")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Admin deletes message
    await adminChat.deleteMessage(message);
    
    // Member should see it disappear
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${message}")`)
    ).toHaveCount(0, { timeout: 5000 });
  });

  test('should show reactions to other users in real-time', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const memberChat = new ChatPage(twoUsers.member.page);
    
    const message = `React in realtime ${Date.now()}`;
    
    // Admin sends message
    await adminChat.sendMessage(message);
    
    // Member sees message
    await memberChat.waitForMessage(message);
    
    // Admin adds reaction
    await adminChat.hoverMessage(message);
    await twoUsers.admin.page.click('button:has-text("🙂 React")');
    await twoUsers.admin.page.locator('button:has-text("👍")').first().click();
    
    // Wait for reaction on admin side
    await expect(
      twoUsers.admin.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("👍")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Member should see the reaction
    await expect(
      twoUsers.member.page.locator(`.flex.gap-3.group:has-text("${message}") button:has-text("👍")`)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show thread replies to other users', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const memberChat = new ChatPage(twoUsers.member.page);
    
    const parentMessage = `Thread parent ${Date.now()}`;
    const replyMessage = `Thread reply ${Date.now()}`;
    
    // Admin sends parent message
    await adminChat.sendMessage(parentMessage);
    
    // Member sees it
    await memberChat.waitForMessage(parentMessage);
    
    // Admin opens thread and replies
    await adminChat.openThread(parentMessage);
    await twoUsers.admin.page.locator('aside textarea').fill(replyMessage);
    await twoUsers.admin.page.locator('aside button:has-text("Send")').click();
    
    // Wait for reply on admin side
    await expect(
      twoUsers.admin.page.locator('aside .prose', { hasText: replyMessage })
    ).toBeVisible({ timeout: 5000 });
    
    // Member should see thread count update
    const count = await memberChat.getThreadCount(parentMessage);
    expect(count).toBe(1);
  });

  test('should sync "Also send to channel" for all users', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    
    const parentMessage = `Parent for channel sync ${Date.now()}`;
    const replyMessage = `Channel sync reply ${Date.now()}`;
    
    // Admin sends parent
    await adminChat.sendMessage(parentMessage);
    
    // Member sees it
    await expect(
      twoUsers.member.page.locator(`.prose:has-text("${parentMessage}")`)
    ).toBeVisible({ timeout: 5000 });
    
    // Admin opens thread and replies with "also send to channel"
    await adminChat.openThread(parentMessage);
    await twoUsers.admin.page.locator('aside input[type="checkbox"]').check();
    await twoUsers.admin.page.locator('aside textarea').fill(replyMessage);
    await twoUsers.admin.page.locator('aside button:has-text("Send")').click();
    
    // Member should see reply in main channel view
    await expect(
      twoUsers.member.page.locator('.overflow-y-auto.p-6 .prose', { hasText: replyMessage })
    ).toBeVisible({ timeout: 10000 });
  });
});
