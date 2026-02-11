import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import { ThreadPanel } from '../pages/ThreadPanel';

test.describe('Threads', () => {
  test('should open thread panel when clicking reply', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent message ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread
    await chat.openThread(parentMessage);
    
    // Thread panel should be visible
    expect(await thread.isVisible()).toBeTruthy();
    
    // Should show the parent message in thread panel
    const parentContent = await thread.getParentContent();
    expect(parentContent).toContain(parentMessage);
  });

  test('should post a thread reply and see it appear in real-time', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent ${Date.now()}`;
    const replyMessage = `Reply ${Date.now()}`;
    
    await chat.sendMessage(parentMessage);
    await chat.openThread(parentMessage);
    
    // Send reply
    await thread.sendReply(replyMessage);
    
    // Reply should appear in thread panel
    await thread.waitForReply(replyMessage);
  });

  test('should increment thread count on parent message', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent with count ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Initially no thread count
    let count = await chat.getThreadCount(parentMessage);
    expect(count).toBe(0);
    
    // Open thread and reply
    await chat.openThread(parentMessage);
    await thread.sendReply(`First reply ${Date.now()}`);
    await thread.close();
    
    // Should show "1 reply"
    count = await chat.getThreadCount(parentMessage);
    expect(count).toBe(1);
    
    // Add another reply
    await chat.openThread(parentMessage);
    await thread.sendReply(`Second reply ${Date.now()}`);
    await thread.close();
    
    // Should show "2 replies"
    count = await chat.getThreadCount(parentMessage);
    expect(count).toBe(2);
  });

  test('should support "Also send to channel" option', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent for channel reply ${Date.now()}`;
    const replyMessage = `This should appear in channel too ${Date.now()}`;
    
    await chat.sendMessage(parentMessage);
    await chat.openThread(parentMessage);
    
    // Send reply with "also send to channel" checked
    await thread.sendReply(replyMessage, true);
    await thread.close();
    
    // Reply should appear in main channel view (not just thread)
    await expect(
      adminUser.page.locator('.overflow-y-auto.p-6 .prose', { hasText: replyMessage })
    ).toBeVisible();
  });

  test('should close thread panel', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent to close ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    await chat.openThread(parentMessage);
    
    // Thread should be open
    expect(await thread.isVisible()).toBeTruthy();
    
    // Close it
    await thread.close();
    
    // Should be closed
    expect(await thread.isVisible()).toBeFalsy();
  });

  test('should show multiple replies in thread', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const thread = new ThreadPanel(adminUser.page);
    
    const parentMessage = `Parent with multiple replies ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    await chat.openThread(parentMessage);
    
    // Send multiple replies
    const reply1 = `Reply 1 ${Date.now()}`;
    const reply2 = `Reply 2 ${Date.now() + 1}`;
    const reply3 = `Reply 3 ${Date.now() + 2}`;
    
    await thread.sendReply(reply1);
    await thread.sendReply(reply2);
    await thread.sendReply(reply3);
    
    // All replies should be visible
    await thread.waitForReply(reply1);
    await thread.waitForReply(reply2);
    await thread.waitForReply(reply3);
    
    // Get all replies
    const replies = await thread.getReplies();
    expect(replies.length).toBeGreaterThanOrEqual(3);
  });
});
