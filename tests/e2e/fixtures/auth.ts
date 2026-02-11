import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const API_URL = process.env.VITE_API_URL || 'http://localhost:4002';
const BASE_URL = 'http://localhost:3002';

/**
 * Auth helper functions for managing user sessions
 */
export class AuthHelper {
  constructor(private page: Page) {}

  /**
   * Sign up a new user (first user becomes admin automatically)
   */
  async signup(username: string, displayName: string, password: string) {
    await this.page.goto(BASE_URL);
    
    // Fill signup form
    await this.page.fill('#username', username);
    await this.page.fill('#displayName', displayName);
    await this.page.fill('#password', password);
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for redirect to main chat (successful signup)
    await this.page.waitForURL(BASE_URL + '/');
    await expect(this.page.locator('text=Relay Chat').first()).toBeVisible();
  }

  /**
   * Log in an existing user
   */
  async login(username: string, password: string) {
    await this.page.goto(BASE_URL + '/login');
    
    // Fill login form
    await this.page.fill('#username', username);
    await this.page.fill('#password', password);
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for redirect to main chat
    await this.page.waitForURL(BASE_URL + '/');
    await expect(this.page.locator('text=Relay Chat').first()).toBeVisible();
  }

  /**
   * Log out the current user
   */
  async logout() {
    // Click logout button (the logout icon in sidebar)
    await this.page.click('button[title="Logout"]');
    
    // Wait for redirect to login page
    await this.page.waitForURL(BASE_URL + '/login');
  }

  /**
   * Create a user via API (for setting up test users without UI)
   */
  async createUserViaAPI(username: string, displayName: string, password: string): Promise<string> {
    const response = await this.page.request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        displayName,
        password,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return data.token;
  }

  /**
   * Set auth token in localStorage (for logged-in state without going through UI)
   */
  async setAuthToken(token: string, user: any) {
    await this.page.goto(BASE_URL);
    await this.page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );
  }

  /**
   * Clear auth state
   */
  async clearAuth() {
    await this.page.goto(BASE_URL);
    await this.page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
  }
}

/**
 * Generate unique username with timestamp to avoid collisions
 */
export function generateUsername(prefix: string = 'user'): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Custom fixture that provides authenticated context
 */
type AuthFixtures = {
  auth: AuthHelper;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  auth: async ({ page }, use) => {
    const auth = new AuthHelper(page);
    await use(auth);
  },

  authenticatedPage: async ({ page, auth }, use) => {
    // Create a fresh user and log in
    const username = generateUsername('test');
    const displayName = `Test User ${Date.now()}`;
    const password = 'testpass123';
    
    await auth.signup(username, displayName, password);
    await use(page);
  },
});

export { expect };
