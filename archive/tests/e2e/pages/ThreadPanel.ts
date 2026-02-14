import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the thread panel (slide-in sidebar)
 */
export class ThreadPanel {
  readonly page: Page;
  readonly panel: Locator;
  readonly replyInput: Locator;
  readonly sendButton: Locator;
  readonly closeButton: Locator;
  readonly alsoSendToChannelCheckbox: Locator;
  readonly parentMessage: Locator;
  readonly repliesList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('aside').last();
    this.replyInput = this.panel.locator('textarea');
    this.sendButton = this.panel.locator('button:has-text("Send")');
    this.closeButton = this.panel.locator('button:has-text("Close")');
    this.alsoSendToChannelCheckbox = this.panel.locator('input[type="checkbox"]');
    this.parentMessage = this.panel.locator('.border-b').first(); // Parent message is typically at top with border
    this.repliesList = this.panel.locator('.space-y-4');
  }

  /**
   * Check if thread panel is visible
   */
  async isVisible(): Promise<boolean> {
    return await this.panel.isVisible();
  }

  /**
   * Send a reply in the thread
   */
  async sendReply(content: string, alsoSendToChannel: boolean = false) {
    if (alsoSendToChannel) {
      await this.alsoSendToChannelCheckbox.check();
    }

    await this.replyInput.fill(content);
    await this.sendButton.click();
    
    // Wait for reply to appear
    await expect(
      this.panel.locator('.prose', { hasText: content })
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Close the thread panel
   */
  async close() {
    await this.closeButton.click();
    await expect(this.panel).toHaveCount(0);
  }

  /**
   * Get the parent message content
   */
  async getParentContent(): Promise<string> {
    return await this.parentMessage.textContent() || '';
  }

  /**
   * Get all replies in the thread
   */
  async getReplies() {
    return await this.panel.locator('.flex.gap-3').all();
  }

  /**
   * Get reply count from thread panel
   */
  async getReplyCount(): Promise<number> {
    const replies = await this.getReplies();
    // Subtract 1 for parent message if it's included in the list
    return replies.length;
  }

  /**
   * Wait for a reply with specific content to appear
   */
  async waitForReply(content: string, timeout: number = 5000) {
    await expect(
      this.panel.locator('.prose', { hasText: content })
    ).toBeVisible({ timeout });
  }

  /**
   * Check if "Also send to channel" checkbox is checked
   */
  async isAlsoSendToChannelChecked(): Promise<boolean> {
    return await this.alsoSendToChannelCheckbox.isChecked();
  }
}
