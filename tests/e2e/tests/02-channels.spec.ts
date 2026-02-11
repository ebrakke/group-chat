import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Channel Flow Tests
 * - View channel list
 * - Switch between channels
 * - Verify #general exists by default
 */

test.describe('Channels', () => {
  test('should display channel list with #general by default', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Get channel names
    const channels = await chat.getChannelNames();

    // Should have at least #general
    expect(channels).toContain('general');
    expect(channels.length).toBeGreaterThan(0);

    // Should show channel in sidebar
    await expect(authenticatedPage.locator('button:has-text("# general")')).toBeVisible();
  });

  test('should switch between channels', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Verify we're on #general by default
    await expect(authenticatedPage.locator('h1', { hasText: '# general' })).toBeVisible();

    // Get all channels
    const channels = await chat.getChannelNames();
    
    if (channels.length > 1) {
      // Switch to a different channel
      const targetChannel = channels.find(c => c !== 'general');
      
      if (targetChannel) {
        await chat.switchChannel(targetChannel);

        // Verify channel header updated
        await expect(authenticatedPage.locator('h1', { hasText: `# ${targetChannel}` })).toBeVisible();

        // Verify channel is highlighted in sidebar
        await expect(
          authenticatedPage.locator(`button:has-text("# ${targetChannel}").bg-blue-100`)
        ).toBeVisible();

        // Switch back to general
        await chat.switchChannel('general');
        await expect(authenticatedPage.locator('h1', { hasText: '# general' })).toBeVisible();
      }
    }
  });

  test('should highlight current channel in sidebar', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Default channel should be highlighted
    const currentChannelBtn = authenticatedPage.locator('button.bg-blue-100:has-text("# general")');
    await expect(currentChannelBtn).toBeVisible();

    // Button should have active styling classes
    const classList = await currentChannelBtn.getAttribute('class');
    expect(classList).toContain('bg-blue-100');
    expect(classList).toContain('text-blue-900');
  });

  test('should show channel description in header', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Channel header should be visible
    await expect(authenticatedPage.locator('h1', { hasText: '# general' })).toBeVisible();
    
    // Description area should exist (may be empty for some channels)
    const description = authenticatedPage.locator('header p.text-sm.text-gray-500');
    await expect(description).toBeVisible();
  });

  test('should preserve channel context when reloading', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);

    // Send a message in #general
    const testMessage = `Channel persistence test ${Date.now()}`;
    await chat.sendMessage(testMessage);

    // Reload the page
    await authenticatedPage.reload();

    // Should still be on #general
    await expect(authenticatedPage.locator('h1', { hasText: '# general' })).toBeVisible();

    // Should still see the message
    await expect(authenticatedPage.locator(`.prose:has-text("${testMessage}")`)).toBeVisible();
  });
});
