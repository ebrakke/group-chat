import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';

/**
 * Page Object Model for the login page
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly signupLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('#username, input[name="username"]');
    this.passwordInput = page.locator('#password, input[name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.text-red-500, .text-red-800, .error, [role="alert"]');
    this.signupLink = page.locator('a:has-text("Sign up"), a:has-text("Create account")');
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto(`${BASE_URL}/login`);
    await expect(this.usernameInput).toBeVisible();
  }

  /**
   * Perform login
   */
  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * Login and wait for redirect to chat
   */
  async loginAndWaitForChat(username: string, password: string) {
    await this.login(username, password);
    await this.page.waitForURL(BASE_URL + '/', { timeout: 5000 });
    await expect(this.page.locator('text=Relay Chat').first()).toBeVisible();
  }

  /**
   * Check if error message is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  /**
   * Click signup link
   */
  async goToSignup() {
    await this.signupLink.click();
    await this.page.waitForURL(/signup/, { timeout: 5000 });
  }
}
