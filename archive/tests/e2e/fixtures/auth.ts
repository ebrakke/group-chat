import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3002';
const API_URL = process.env.E2E_API_URL || BASE_URL;

let bootstrapAdmin: { username: string; password: string } | null = null;

async function resetDatabaseForTest() {
  const resetScriptContent = `const Database = require('better-sqlite3'); const db = new Database('/app/relay-chat.db'); const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name); const deleteOrder = ['message_reactions', 'thread_replies', 'messages', 'invites', 'sessions', 'users']; db.pragma('foreign_keys = OFF'); for (const name of deleteOrder) { if (tables.includes(name)) db.prepare('DELETE FROM ' + name).run(); } db.pragma('foreign_keys = ON');`;

  try {
    const repoRoot = path.resolve(__dirname, '../../..');
    const composeFile = path.join(repoRoot, 'docker-compose.dev.yml');
    
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        composeFile,
        'exec',
        '-T',
        'frontend',
        'node',
        '-e',
        resetScriptContent,
      ],
      { stdio: 'pipe' }
    );
  } catch (err: any) {
    console.error('[TEST] Failed to reset database:', err.message);
  }

  bootstrapAdmin = null;
}

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

    const hasFirstUserSignup = await this.page.locator('#displayName').isVisible().catch(() => false);

    if (hasFirstUserSignup) {
      // First-user signup UI flow
      await this.page.fill('#username', username);
      await this.page.fill('#displayName', displayName);
      await this.page.fill('#password', password);
      await this.page.click('button[type="submit"]');
      bootstrapAdmin = { username, password };
    } else {
      // Regular user creation via API, then seed auth state
      const { token, user } = await this.createUserViaAPI(username, displayName, password);
      if (!bootstrapAdmin) {
        bootstrapAdmin = { username, password };
      }
      await this.setAuthToken(token, user);
      await this.page.goto(BASE_URL);
    }

    await this.page.waitForURL(BASE_URL + '/');
    await expect(this.page.locator('text=Relay Chat').first()).toBeVisible();

    const token = await this.page.evaluate(() => localStorage.getItem('token'));
    if (token) {
      await this.ensureGeneralChannel(token);
      await this.page.reload();
      await this.page.waitForURL(BASE_URL + '/');
      await this.page.waitForLoadState('networkidle');
    }
  }

  async ensureGeneralChannel(token: string) {
    const channelsResp = await this.page.request.get(`${API_URL}/api/v1/channels`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!channelsResp.ok()) return;

    const channels = await channelsResp.json();
    const hasGeneral = Array.isArray(channels) && channels.some((c: any) => c.name === 'general');

    if (!hasGeneral) {
      await this.page.request.post(`${API_URL}/api/v1/channels`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          id: 'general',
          name: 'general',
          description: 'General discussion',
        },
      });
    }
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
  async createUserViaAPI(username: string, displayName: string, password: string): Promise<{ token: string; user: any }> {
    const attempt = async (inviteCode?: string) => {
      return this.page.request.post(`${API_URL}/api/v1/auth/signup`, {
        data: {
          username,
          displayName,
          password,
          inviteCode,
        },
      });
    };

    let response = await attempt();

    if (!response.ok()) {
      const body = await response.text();

      // If invites are required in this environment, create one with bootstrap admin and retry
      if (response.status() === 400 && body.includes('Invite code required') && bootstrapAdmin) {
        const loginResp = await this.page.request.post(`${API_URL}/api/v1/auth/login`, {
          data: {
            username: bootstrapAdmin.username,
            password: bootstrapAdmin.password,
          },
        });

        if (!loginResp.ok()) {
          throw new Error(`Bootstrap admin login failed (${loginResp.status()}): ${await loginResp.text()}`);
        }

        const loginData = await loginResp.json();
        const inviteResp = await this.page.request.post(`${API_URL}/api/v1/invites`, {
          headers: {
            Authorization: `Bearer ${loginData.token}`,
          },
          data: {
            maxUses: 10,
          },
        });

        if (!inviteResp.ok()) {
          throw new Error(`Invite creation failed (${inviteResp.status()}): ${await inviteResp.text()}`);
        }

        const inviteData = await inviteResp.json();
        response = await attempt(inviteData.code);
        if (!response.ok()) {
          throw new Error(`Signup with invite failed (${response.status()}): ${await response.text()}`);
        }
      } else {
        throw new Error(`Signup API failed (${response.status()}): ${body}`);
      }
    }

    const data = await response.json();
    return { token: data.token, user: data.user };
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
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) || 'user';
  const suffix = Math.random().toString(36).slice(2, 10); // 8 chars
  return `${cleanPrefix}_${suffix}`.slice(0, 20);
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
    // Reset database for this test
    await resetDatabaseForTest();
    
    // Wait for database reset to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create a fresh user and log in
    const username = generateUsername('test');
    const displayName = `Test User ${Date.now()}`;
    const password = 'testpass123';
    
    await auth.signup(username, displayName, password);
    await use(page);
  },
});

export { expect };
