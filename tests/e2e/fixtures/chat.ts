import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the main chat interface
 */
export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messagesContainer: Locator;
  readonly channelList: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.locator('textarea[placeholder*="Message"]');
    this.sendButton = page.locator('button[type="submit"]:has-text("Send")');
    this.messagesContainer = page.locator('.overflow-y-auto.p-6.space-y-4');
    this.channelList = page.locator('nav button:has-text("#")');
    this.logoutButton = page.locator('button[title="Logout"]');
  }

  /**
   * Send a message in the current channel
   */
  async sendMessage(content: string) {
    await this.messageInput.fill(content);
    await this.sendButton.click();
    
    // Wait for message to appear (real-time via WebSocket)
    await this.waitForMessage(content);
  }

  /**
   * Wait for a message with specific content to appear
   */
  async waitForMessage(content: string, timeout: number = 5000) {
    await expect(
      this.page.locator(`.prose:has-text("${content}")`).first()
    ).toBeVisible({ timeout });
  }

  /**
   * Get all visible messages
   */
  async getMessages() {
    return this.page.locator('.flex.gap-3.group').all();
  }

  /**
   * Switch to a different channel
   */
  async switchChannel(channelName: string) {
    await this.page.click(`button:has-text("# ${channelName}")`);
    
    // Wait for channel header to update
    await expect(
      this.page.locator('h1', { hasText: `# ${channelName}` })
    ).toBeVisible();
  }

  /**
   * Get list of available channels
   */
  async getChannelNames(): Promise<string[]> {
    const channels = await this.channelList.all();
    const names: string[] = [];
    
    for (const channel of channels) {
      const text = await channel.textContent();
      if (text) {
        names.push(text.replace('#', '').trim());
      }
    }
    
    return names;
  }

  /**
   * Hover over a message to reveal actions
   */
  async hoverMessage(content: string) {
    const message = this.page.locator('.flex.gap-3.group', { hasText: content }).first();
    await message.hover();
  }

  /**
   * Edit a message
   */
  async editMessage(originalContent: string, newContent: string) {
    await this.hoverMessage(originalContent);
    await this.page.click('button:has-text("✏️ Edit")');
    
    // Fill the edit textarea
    const editTextarea = this.page.locator('textarea').first();
    await editTextarea.fill(newContent);
    
    // Click Save
    await this.page.click('button:has-text("Save")');
    
    // Wait for edited message to appear
    await this.waitForMessage(newContent);
  }

  /**
   * Delete a message
   */
  async deleteMessage(content: string) {
    await this.hoverMessage(content);
    
    // Set up dialog handler before clicking delete
    this.page.once('dialog', dialog => dialog.accept());
    
    await this.page.click('button:has-text("🗑️ Delete")');
    
    // Wait for message to disappear
    await expect(
      this.page.locator(`.prose:has-text("${content}")`)
    ).toHaveCount(0, { timeout: 5000 });
  }

  /**
   * Open thread panel for a message
   */
  async openThread(messageContent: string) {
    await this.hoverMessage(messageContent);
    await this.page.click('button:has-text("💬 Reply in thread")');
    
    // Wait for thread panel to appear
    await expect(this.page.locator('aside').last()).toBeVisible();
  }

  /**
   * Send a thread reply
   */
  async sendThreadReply(content: string) {
    // Find the thread panel textarea (different from main message input)
    const threadInput = this.page.locator('aside textarea').last();
    await threadInput.fill(content);
    
    // Click the Send button in thread panel
    const threadSendBtn = this.page.locator('aside button:has-text("Send")').last();
    await threadSendBtn.click();
    
    // Wait for reply to appear in thread
    await expect(
      this.page.locator('aside .prose', { hasText: content })
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Close the thread panel
   */
  async closeThread() {
    await this.page.click('aside button:has-text("Close")');
    await expect(this.page.locator('aside').last()).toHaveCount(0);
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(messageContent: string, emoji: string) {
    await this.hoverMessage(messageContent);
    await this.page.click('button:has-text("🙂 React")');
    
    // Wait for emoji picker modal
    await expect(this.page.locator('div[role="dialog"], .modal').first()).toBeVisible();
    
    // Click the emoji
    await this.page.click(`button:has-text("${emoji}")`);
    
    // Wait for reaction to appear on message
    await expect(
      this.page.locator(`.flex.gap-3.group:has-text("${messageContent}") button:has-text("${emoji}")`)
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Click an existing reaction (to toggle it)
   */
  async toggleReaction(messageContent: string, emoji: string) {
    const reactionButton = this.page.locator(
      `.flex.gap-3.group:has-text("${messageContent}") button:has-text("${emoji}")`
    ).first();
    
    await reactionButton.click();
  }

  /**
   * Get reaction count for a specific emoji on a message
   */
  async getReactionCount(messageContent: string, emoji: string): Promise<number> {
    const message = this.page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    const reactionBtn = message.locator(`button:has-text("${emoji}")`).first();
    
    if (await reactionBtn.count() === 0) {
      return 0;
    }
    
    const text = await reactionBtn.textContent();
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Get thread reply count for a message
   */
  async getThreadCount(messageContent: string): Promise<number> {
    const message = this.page.locator('.flex.gap-3.group', { hasText: messageContent }).first();
    const threadBtn = message.locator('button:has-text("reply", "replies")').first();
    
    if (await threadBtn.count() === 0) {
      return 0;
    }
    
    const text = await threadBtn.textContent();
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }
}
