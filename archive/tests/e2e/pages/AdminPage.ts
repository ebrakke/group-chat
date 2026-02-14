import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for admin panel/settings
 */
export class AdminPage {
  readonly page: Page;
  readonly settingsButton: Locator;
  readonly adminPanel: Locator;
  readonly usersTab: Locator;
  readonly invitesTab: Locator;
  readonly generateInviteButton: Locator;
  readonly inviteCodeDisplay: Locator;
  readonly usersList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.settingsButton = page.locator('button[title="Settings"], button:has-text("Settings")');
    this.adminPanel = page.locator('div[role="dialog"]').filter({ hasText: /Admin|Settings/ });
    this.usersTab = this.adminPanel.locator('button:has-text("Users")');
    this.invitesTab = this.adminPanel.locator('button:has-text("Invites")');
    this.generateInviteButton = this.adminPanel.locator('button:has-text("Generate"), button:has-text("Create Invite")');
    this.inviteCodeDisplay = this.adminPanel.locator('code, .font-mono');
    this.usersList = this.adminPanel.locator('ul, .user-list');
  }

  /**
   * Open admin settings panel
   */
  async open() {
    await this.settingsButton.click();
    await expect(this.adminPanel).toBeVisible();
  }

  /**
   * Navigate to Users tab
   */
  async goToUsersTab() {
    await this.usersTab.click();
    await expect(this.usersList).toBeVisible();
  }

  /**
   * Navigate to Invites tab
   */
  async goToInvitesTab() {
    await this.invitesTab.click();
    await expect(this.generateInviteButton).toBeVisible();
  }

  /**
   * Generate an invite code
   */
  async generateInvite(): Promise<string> {
    await this.generateInviteButton.click();
    await expect(this.inviteCodeDisplay).toBeVisible();
    return await this.inviteCodeDisplay.textContent() || '';
  }

  /**
   * Remove a user (admin action)
   */
  async removeUser(username: string) {
    // Find user row and click remove button
    const userRow = this.adminPanel.locator(`tr, li`, { hasText: username });
    const removeButton = userRow.locator('button:has-text("Remove"), button:has-text("Delete")');
    
    // Handle confirmation
    this.page.once('dialog', dialog => dialog.accept());
    
    await removeButton.click();
    
    // Wait for user to be removed from list
    await expect(userRow).toHaveCount(0, { timeout: 5000 });
  }

  /**
   * Promote a user to admin
   */
  async promoteToAdmin(username: string) {
    const userRow = this.adminPanel.locator(`tr, li`, { hasText: username });
    const promoteButton = userRow.locator('button:has-text("Promote"), button:has-text("Make Admin")');
    
    await promoteButton.click();
    
    // Wait for admin badge to appear
    await expect(userRow.locator('text=/admin/i')).toBeVisible({ timeout: 5000 });
  }

  /**
   * Get list of all users
   */
  async getUsers(): Promise<string[]> {
    const userItems = await this.usersList.locator('li, tr').all();
    const users: string[] = [];
    
    for (const item of userItems) {
      const text = await item.textContent();
      if (text) {
        users.push(text.trim());
      }
    }
    
    return users;
  }

  /**
   * Close admin panel
   */
  async close() {
    const closeButton = this.adminPanel.locator('button:has-text("Close"), button[aria-label="Close"]');
    await closeButton.click();
    await expect(this.adminPanel).toHaveCount(0);
  }
}
