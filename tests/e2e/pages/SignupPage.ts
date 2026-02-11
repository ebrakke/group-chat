import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';

/**
 * Page Object Model for the signup page
 */
export class SignupPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly displayNameInput: Locator;
  readonly passwordInput: Locator;
  readonly inviteCodeInput: Locator;
  readonly signupButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('#username, input[name="username"]');
    this.displayNameInput = page.locator('#displayName, input[name="displayName"]');
    this.passwordInput = page.locator('#password, input[name="password"]');
    this.inviteCodeInput = page.locator('#inviteCode, input[name="inviteCode"]');
    this.signupButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.text-red-500, .error, [role="alert"]');
    this.loginLink = page.locator('a:has-text("Log in"), a:has-text("Sign in")');
  }

  /**
   * Navigate to signup page
   */
  async goto(inviteCode?: string) {
    const url = inviteCode ? `${BASE_URL}/signup?invite=${inviteCode}` : `${BASE_URL}/signup`;
    await this.page.goto(url);
    await expect(this.usernameInput).toBeVisible();
  }

  /**
   * Navigate to root (first user signup)
   */
  async gotoFirstUserSignup() {
    await this.page.goto(BASE_URL);
    await expect(this.page.locator('h1', { hasText: 'Welcome to Relay Chat' })).toBeVisible();
  }

  /**
   * Perform signup
   */
  async signup(username: string, displayName: string, password: string, inviteCode?: string) {
    await this.usernameInput.fill(username);
    await this.displayNameInput.fill(displayName);
    await this.passwordInput.fill(password);
    
    if (inviteCode && await this.inviteCodeInput.isVisible()) {
      await this.inviteCodeInput.fill(inviteCode);
    }
    
    await this.signupButton.click();
  }

  /**
   * Signup and wait for redirect to chat
   */
  async signupAndWaitForChat(username: string, displayName: string, password: string, inviteCode?: string) {
    await this.signup(username, displayName, password, inviteCode);
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
   * Click login link
   */
  async goToLogin() {
    await this.loginLink.click();
    await this.page.waitForURL(/login/, { timeout: 5000 });
  }
}
