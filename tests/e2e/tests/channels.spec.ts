import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import { ChannelModal } from '../pages/ChannelModal';

test.describe('Channels', () => {
  test('should display channel list with #general by default', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    // Get channel names
    const channels = await chat.getChannelNames();
    
    // Should have at least #general
    expect(channels).toContain('general');
    expect(channels.length).toBeGreaterThan(0);
    
    // Should show channel in sidebar
    await expect(adminUser.page.locator('button:has-text("# general")')).toBeVisible();
  });

  test('should switch between channels', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const modal = new ChannelModal(adminUser.page);
    
    // Create a new channel
    const channelName = `test${Date.now()}`;
    await chat.openCreateChannelModal();
    await modal.createChannel(channelName, 'Test channel');
    
    // Wait for new channel to appear in sidebar
    await expect(adminUser.page.locator(`button:has-text("# ${channelName}")`)).toBeVisible();
    
    // Switch to it
    await chat.switchChannel(channelName);
    
    // Should show channel header
    await expect(adminUser.page.locator('h1', { hasText: `# ${channelName}` })).toBeVisible();
    
    // Switch back to general
    await chat.switchChannel('general');
    await expect(adminUser.page.locator('h1', { hasText: '# general' })).toBeVisible();
  });

  test('should create a new channel', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const modal = new ChannelModal(adminUser.page);
    
    const channelName = `newchan${Date.now()}`;
    const description = 'A new test channel';
    
    await chat.openCreateChannelModal();
    await modal.createChannel(channelName, description);
    
    // New channel should appear in sidebar
    await expect(adminUser.page.locator(`button:has-text("# ${channelName}")`)).toBeVisible();
    
    // Should auto-switch to new channel
    await expect(adminUser.page.locator('h1', { hasText: `# ${channelName}` })).toBeVisible();
  });

  test('should allow member to create a channel', async ({ memberUser }) => {
    const chat = new ChatPage(memberUser.page);
    const modal = new ChannelModal(memberUser.page);
    
    const channelName = `memberchan${Date.now()}`;
    
    await chat.openCreateChannelModal();
    await modal.createChannel(channelName);
    
    // Channel should be created successfully
    await expect(memberUser.page.locator(`button:has-text("# ${channelName}")`)).toBeVisible();
  });

  test('should edit channel name and description', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const modal = new ChannelModal(adminUser.page);
    
    // Create channel
    const originalName = `original${Date.now()}`;
    await chat.openCreateChannelModal();
    await modal.createChannel(originalName, 'Original description');
    
    // Open channel settings to edit
    // This depends on UI - might be clicking channel name or settings icon
    await adminUser.page.click('h1', { hasText: `# ${originalName}` });
    
    const newName = `edited${Date.now()}`;
    const newDescription = 'Edited description';
    
    await modal.editChannel(newName, newDescription);
    
    // Should show new name
    await expect(adminUser.page.locator('h1', { hasText: `# ${newName}` })).toBeVisible();
  });

  test('should delete a channel', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const modal = new ChannelModal(adminUser.page);
    
    // Create channel to delete
    const channelName = `todelete${Date.now()}`;
    await chat.openCreateChannelModal();
    await modal.createChannel(channelName);
    
    // Verify it exists
    await expect(adminUser.page.locator(`button:has-text("# ${channelName}")`)).toBeVisible();
    
    // Open channel settings
    await adminUser.page.click('h1', { hasText: `# ${channelName}` });
    
    // Delete it
    await modal.deleteChannel();
    
    // Should redirect to #general and channel should be gone
    await expect(adminUser.page.locator(`button:has-text("# ${channelName}")`)).toHaveCount(0);
  });

  test('should not allow deleting #general', async ({ adminUser }) => {
    // Switch to #general
    await adminUser.page.click('button:has-text("# general")');
    
    // Click on channel header to open settings
    await adminUser.page.click('h1', { hasText: '# general' });
    
    // Delete button should either not exist or be disabled
    const deleteBtn = adminUser.page.locator('button:has-text("Delete")');
    
    // Either not visible or disabled
    if (await deleteBtn.count() > 0) {
      await expect(deleteBtn).toBeDisabled();
    }
  });

  test('should show channel in sidebar after creation for other users', async ({ twoUsers }) => {
    const adminChat = new ChatPage(twoUsers.admin.page);
    const memberChat = new ChatPage(twoUsers.member.page);
    const modal = new ChannelModal(twoUsers.admin.page);
    
    const channelName = `realtime${Date.now()}`;
    
    // Admin creates channel
    await adminChat.openCreateChannelModal();
    await modal.createChannel(channelName);
    
    // Member should see it in sidebar (real-time update)
    await expect(twoUsers.member.page.locator(`button:has-text("# ${channelName}")`)).toBeVisible({ timeout: 10000 });
  });
});
