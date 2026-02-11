import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for channel creation/edit modal
 */
export class ChannelModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly createButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('div[role="dialog"]').first();
    this.nameInput = this.modal.locator('input[name="name"], input[placeholder*="name" i]');
    this.descriptionInput = this.modal.locator('input[name="description"], textarea[name="description"], input[placeholder*="description" i]');
    this.createButton = this.modal.locator('button:has-text("Create")');
    this.saveButton = this.modal.locator('button:has-text("Save")');
    this.cancelButton = this.modal.locator('button:has-text("Cancel")');
    this.deleteButton = this.modal.locator('button:has-text("Delete")');
  }

  /**
   * Check if modal is visible
   */
  async isVisible(): Promise<boolean> {
    return await this.modal.isVisible();
  }

  /**
   * Create a new channel
   */
  async createChannel(name: string, description?: string) {
    await expect(this.modal).toBeVisible();
    
    await this.nameInput.fill(name);
    
    if (description) {
      await this.descriptionInput.fill(description);
    }
    
    await this.createButton.click();
    
    // Wait for modal to close
    await expect(this.modal).toHaveCount(0, { timeout: 5000 });
  }

  /**
   * Edit an existing channel
   */
  async editChannel(name?: string, description?: string) {
    await expect(this.modal).toBeVisible();
    
    if (name) {
      await this.nameInput.clear();
      await this.nameInput.fill(name);
    }
    
    if (description) {
      await this.descriptionInput.clear();
      await this.descriptionInput.fill(description);
    }
    
    await this.saveButton.click();
    
    // Wait for modal to close
    await expect(this.modal).toHaveCount(0, { timeout: 5000 });
  }

  /**
   * Delete the channel
   */
  async deleteChannel() {
    await expect(this.modal).toBeVisible();
    
    // Handle confirmation dialog
    this.page.once('dialog', dialog => dialog.accept());
    
    await this.deleteButton.click();
    
    // Wait for modal to close
    await expect(this.modal).toHaveCount(0, { timeout: 5000 });
  }

  /**
   * Cancel and close the modal
   */
  async cancel() {
    await this.cancelButton.click();
    await expect(this.modal).toHaveCount(0);
  }
}
