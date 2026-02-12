import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

const BASE_URL = 'http://localhost:3002';

test.describe('Channels', () => {
  test('General channel exists by default', async ({ memberUser }) => {
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Should see general in channel list
    await expect(page.locator('button:has-text("# general")').first()).toBeVisible();
    
    // General should be selected by default
    const generalBtn = page.locator('button:has-text("# general")').first();
    const classList = await generalBtn.getAttribute('class');
    expect(classList).toMatch(/bg-|selected|active/); // Some active state styling
  });

  test('User sees all channels in sidebar', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create additional channels via API
    await api.createChannel(token, 'random', 'Random discussion');
    await api.createChannel(token, 'dev', 'Development talk');
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should see all three channels
    await expect(page.locator('button:has-text("# general")').first()).toBeVisible();
    await expect(page.locator('button:has-text("# random")').first()).toBeVisible();
    await expect(page.locator('button:has-text("# dev")').first()).toBeVisible();
  });

  test('User switches between channels', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create random channel
    await api.createChannel(token, 'random', 'Random channel');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Click on random
    await page.click('button:has-text("# random")');
    
    // Main panel should show random
    await expect(page.locator('h1:has-text("# random")').first()).toBeVisible();
    
    // Input placeholder should update
    const input = page.locator('textarea[placeholder*="Message"]').first();
    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder?.toLowerCase()).toContain('random');
  });

  test('Member creates a new channel', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Click + button or "New Channel" button
    const newChannelBtn = page.locator('button:has-text("+"), button:has-text("New Channel")').first();
    await newChannelBtn.click();
    
    // Wait for modal
    await expect(page.locator('div[role="dialog"]').first()).toBeVisible();
    
    // Fill channel details
    await page.fill('input[name="name"], #name', 'new-channel');
    await page.fill('input[name="description"], #description, textarea[name="description"]', 'A test channel');
    
    // Click create
    await page.click('button:has-text("Create")');
    
    // Should see new channel in sidebar
    await expect(page.locator('button:has-text("# new-channel")').first()).toBeVisible({ timeout: 5000 });
    
    // Should be switched to new channel
    await expect(page.locator('h1:has-text("# new-channel")').first()).toBeVisible();
  });

  test('Cannot create channel with duplicate name', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a channel via API
    await api.createChannel(token, 'existing', 'Existing channel');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Try to create duplicate
    const newChannelBtn = page.locator('button:has-text("+"), button:has-text("New Channel")').first();
    await newChannelBtn.click();
    
    await expect(page.locator('div[role="dialog"]').first()).toBeVisible();
    await page.fill('input[name="name"], #name', 'existing');
    await page.fill('input[name="description"], #description, textarea[name="description"]', 'Duplicate');
    await page.click('button:has-text("Create")');
    
    // Should see error
    const errorMsg = page.locator('.text-red-500, .error, [role="alert"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });

  test('Channel name validation', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Open create channel modal
    const newChannelBtn = page.locator('button:has-text("+"), button:has-text("New Channel")').first();
    await newChannelBtn.click();
    
    await expect(page.locator('div[role="dialog"]').first()).toBeVisible();
    
    // Try to create with empty name
    await page.fill('input[name="description"], #description, textarea[name="description"]', 'Test');
    
    const createBtn = page.locator('button:has-text("Create")');
    
    // Button should be disabled or show validation error
    const isDisabled = await createBtn.isDisabled();
    if (!isDisabled) {
      await createBtn.click();
      // Should see validation error
      const errorMsg = page.locator('.text-red-500, .error, [role="alert"]').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    } else {
      expect(isDisabled).toBe(true);
    }
  });

  test('Member edits a channel\'s name and description', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a test channel
    const channel = await api.createChannel(token, 'test-channel', 'Original description');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigate to test channel
    await page.click('button:has-text("# test-channel")');
    
    // Open channel menu (settings/gear icon or dropdown)
    const menuBtn = page.locator('button[title="Channel settings"], button:has-text("⚙"), button[aria-label*="menu"]').first();
    await menuBtn.click();
    
    // Click Edit Channel
    const editBtn = page.locator('button:has-text("Edit")').first();
    await editBtn.click();
    
    // Change name and description
    await page.fill('input[name="name"], #name', 'renamed-channel');
    await page.fill('input[name="description"], #description, textarea[name="description"]', 'Updated description');
    
    // Save
    await page.click('button:has-text("Save")');
    
    // Channel header should show new name
    await expect(page.locator('h1:has-text("# renamed-channel")').first()).toBeVisible({ timeout: 5000 });
    
    // Description should update
    await expect(page.locator('text=Updated description').first()).toBeVisible();
  });

  test('Member deletes a channel', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    
    // Create a channel to delete
    await api.createChannel(token, 'to-delete', 'Will be deleted');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigate to the channel
    await page.click('button:has-text("# to-delete")');
    
    // Open channel menu
    const menuBtn = page.locator('button[title="Channel settings"], button:has-text("⚙"), button[aria-label*="menu"]').first();
    await menuBtn.click();
    
    // Click Delete
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    
    // Handle confirmation dialog
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    
    // Channel should disappear from sidebar
    await expect(page.locator('button:has-text("# to-delete")')).toHaveCount(0, { timeout: 5000 });
    
    // Should be switched to general
    await expect(page.locator('h1:has-text("# general")').first()).toBeVisible();
  });

  test.skip('Cannot delete the general channel', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Navigate to general
    await page.click('button:has-text("# general")');
    
    // Open channel menu
    const menuBtn = page.locator('button[title="Channel settings"], button:has-text("⚙"), button[aria-label*="menu"]').first();
    
    // If menu button exists
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      
      // Should not see Delete option
      const deleteBtn = page.locator('button:has-text("Delete")');
      await expect(deleteBtn).toHaveCount(0);
    }
    // Or general channel might not have a settings button at all
  });
});
