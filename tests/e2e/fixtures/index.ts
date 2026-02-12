import { test as base, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AuthHelper, generateUsername } from './auth';
import { ChatPage } from '../pages/ChatPage';
import { LoginPage } from '../pages/LoginPage';
import { SignupPage } from '../pages/SignupPage';

const BASE_URL = 'http://localhost:3002';
const API_URL = process.env.VITE_API_URL || BASE_URL;

/**
 * API Helpers for direct backend interaction
 */
export class APIHelper {
  constructor(private request: APIRequestContext) {}

  /**
   * Create an invite code (requires admin token)
   * 
   * Note: Invites may not be required depending on INVITE_REQUIRED env var.
   * This method handles both cases gracefully.
   */
  async createInvite(token: string): Promise<string> {
    const response = await this.request.post(`${API_URL}/api/v1/invites`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      data: {},
    });
    
    const data = await response.json();
    if (!response.ok()) {
      // 401 means the session token is invalid/expired (e.g. database reset)
      if (response.status() === 401) {
        throw new Error('INVALID_TOKEN');
      }
      // 403 means token is valid but user is not allowed to create invites
      if (response.status() === 403) {
        throw new Error('FORBIDDEN');
      }
      throw new Error(`Invite creation failed (${response.status()}): ${JSON.stringify(data)}`);
    }
    return data.code;
  }

  /**
   * Create a channel via API
   */
  async createChannel(token: string, name: string, description?: string) {
    const response = await this.request.post(`${API_URL}/api/v1/channels`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      data: {
        id: name, // Use name as ID (channel IDs should match names for path-based routing)
        name,
        description: description || `Channel ${name}`,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Delete a channel via API
   */
  async deleteChannel(token: string, channelId: string) {
    const response = await this.request.delete(`${API_URL}/api/v1/channels/${channelId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    expect(response.ok()).toBeTruthy();
  }

  /**
   * Send a message via API
   */
  async sendMessage(token: string, channelId: string, content: string, attachments?: any[]) {
    const response = await this.request.post(`${API_URL}/api/v1/channels/${channelId}/messages`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      data: {
        content,
        attachments: attachments || [],
      },
    });
    
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Send a thread reply via API
   */
  async sendThreadReply(token: string, messageId: string, content: string) {
    const response = await this.request.post(`${API_URL}/api/v1/messages/${messageId}/replies`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      data: {
        content,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Get user info - Note: /users/me is not implemented, so we decode from token or use signup response
   */
  async getUser(token: string): Promise<any> {
    // Workaround: decode JWT or return mock user
    // Since /users/me returns 501, we'll just return a placeholder
    // The actual user info is in localStorage after signup
    return { username: 'user', role: 'member' };
  }

  /**
   * Signup via API - returns { token, user }
   * 
   * Note: inviteCode is optional and only required when INVITE_REQUIRED=true
   */
  async signup(username: string, displayName: string, password: string, inviteCode?: string): Promise<{ token: string; user: any }> {
    const response = await this.request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        displayName,
        password,
        ...(inviteCode ? { inviteCode } : {}),
      },
    });
    
    const data = await response.json();
    if (!response.ok()) {
      throw new Error(`Signup failed (${response.status()}): ${JSON.stringify(data)}`);
    }
    return { token: data.token, user: data.user };
  }

  /**
   * Login via API
   */
  async login(username: string, password: string) {
    const response = await this.request.post(`${API_URL}/api/v1/auth/login`, {
      data: {
        username,
        password,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return data.token;
  }
}

/**
 * User context with both page and API access
 */
export interface UserContext {
  page: Page;
  token: string;
  user: any;
  api: APIHelper;
  username: string;
  password: string;
}

/**
 * Extended fixtures for Relay Chat testing
 */
type RelayFixtures = {
  auth: AuthHelper;
  api: APIHelper;
  adminUser: UserContext;
  memberUser: UserContext;
  twoUsers: { admin: UserContext; member: UserContext };
  chatPage: ChatPage;
  loginPage: LoginPage;
  signupPage: SignupPage;
};

/**
 * Bootstrap admin - created once per test run and reused
 * This is reset to null when the database is reset
 */
let bootstrapAdmin: { token: string; username: string; password: string } | null = null;
const BOOTSTRAP_CACHE_FILE = path.resolve(process.cwd(), '.tmp/e2e-bootstrap-admin.json');

function loadBootstrapFromDisk(): { username: string; password: string } | null {
  try {
    if (!fs.existsSync(BOOTSTRAP_CACHE_FILE)) return null;
    const raw = fs.readFileSync(BOOTSTRAP_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed?.username && parsed?.password) {
      return { username: parsed.username, password: parsed.password };
    }
  } catch {
    // ignore cache read errors
  }
  return null;
}

function saveBootstrapToDisk(username: string, password: string) {
  fs.mkdirSync(path.dirname(BOOTSTRAP_CACHE_FILE), { recursive: true });
  fs.writeFileSync(BOOTSTRAP_CACHE_FILE, JSON.stringify({ username, password }), 'utf-8');
}

/**
 * Helper to ensure we have a valid bootstrap admin
 * This handles database resets by detecting invalid tokens and recreating the admin
 */
async function ensureBootstrapAdmin(api: APIHelper): Promise<{ token: string; username: string; password: string }> {
  // If in-memory cache is empty (e.g. worker restart), try restoring credentials from disk
  if (!bootstrapAdmin) {
    const cached = loadBootstrapFromDisk();
    if (cached) {
      try {
        const token = await api.login(cached.username, cached.password);
        bootstrapAdmin = { token, username: cached.username, password: cached.password };
        console.log('✓ Restored bootstrap admin from cache');
      } catch {
        // Cache is stale, continue to create a new bootstrap user
      }
    }
  }

  // If we still don't have a bootstrap admin yet, create one
  if (!bootstrapAdmin) {
    const username = generateUsername('bootstrap');
    const password = 'adminpass123';
    const displayName = 'Bootstrap Admin';

    const { token } = await api.signup(username, displayName, password);
    bootstrapAdmin = { token, username, password };
    saveBootstrapToDisk(username, password);
    console.log('✓ Created bootstrap admin');
    return bootstrapAdmin;
  }

  // Verify the bootstrap admin token is still valid by trying to create an invite
  try {
    await api.createInvite(bootstrapAdmin.token);
    return bootstrapAdmin;
  } catch (error: any) {
    // If token is invalid (e.g. DB reset), re-login using cached credentials
    if (error.message === 'INVALID_TOKEN') {
      try {
        const token = await api.login(bootstrapAdmin.username, bootstrapAdmin.password);
        bootstrapAdmin = { ...bootstrapAdmin, token };
        return bootstrapAdmin;
      } catch {
        // login failed, likely DB reset wiped user
      }

      console.log('⚠️  Bootstrap admin token invalid (database reset detected)');
      const username = generateUsername('bootstrap');
      const password = 'adminpass123';
      const displayName = 'Bootstrap Admin';

      const { token } = await api.signup(username, displayName, password);
      bootstrapAdmin = { token, username, password };
      saveBootstrapToDisk(username, password);
      console.log('✓ Recreated bootstrap admin after database reset');
      return bootstrapAdmin;
    }

    // If invite creation failed for other reasons (e.g. FORBIDDEN/INVITE_REQUIRED=false), keep token
    return bootstrapAdmin;
  }
}

/**
 * Helper to create an invite code, handling the case where invites are not required
 */
async function createInviteIfRequired(api: APIHelper, token: string): Promise<string | undefined> {
  try {
    return await api.createInvite(token);
  } catch (error: any) {
    // If invite creation fails and it's not an invalid token, invites might not be required
    if (error.message !== 'INVALID_TOKEN') {
      console.log('Note: Invite creation failed, continuing without invite code (likely INVITE_REQUIRED=false)');
      return undefined;
    }
    throw error; // Re-throw INVALID_TOKEN errors
  }
}

export const test = base.extend<RelayFixtures>({
  auth: async ({ page }, use) => {
    const auth = new AuthHelper(page);
    await use(auth);
  },

  api: async ({ request }, use) => {
    const api = new APIHelper(request);
    await use(api);
  },

  /**
   * Admin user fixture - first user (has admin privileges)
   * 
   * Creates a fresh browser context with an authenticated admin user.
   * The user is logged in via UI to ensure proper session state.
   */
  adminUser: async ({ browser, api }, use) => {
    // Ensure we have a valid bootstrap admin
    const bootstrap = await ensureBootstrapAdmin(api);
    
    // Create a new context for the admin user
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login via UI to ensure frontend session state is established
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(bootstrap.username, bootstrap.password);
    await page.waitForURL(BASE_URL + '/general', { timeout: 10000 });

    const userContext: UserContext = {
      page,
      token: bootstrap.token,
      user: { id: 'admin', username: bootstrap.username, displayName: 'Bootstrap Admin', role: 'admin', nostrPubkey: '' },
      api,
      username: bootstrap.username,
      password: bootstrap.password,
    };

    await use(userContext);

    // Cleanup
    await context.close();
  },

  /**
   * Member user fixture - signs up via invite
   * 
   * Creates a fresh browser context with an authenticated member user.
   * Handles invite creation if required by the environment.
   */
  memberUser: async ({ browser, api }, use) => {
    // Ensure bootstrap admin exists and is valid
    const bootstrap = await ensureBootstrapAdmin(api);
    
    // Generate invite from bootstrap admin (only if required)
    const inviteCode = await createInviteIfRequired(api, bootstrap.token);

    // Now create member with invite (if provided)
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const username = generateUsername('member');
    const displayName = `Member ${Date.now()}`;
    const password = 'memberpass123';

    const { token, user } = await api.signup(username, displayName, password, inviteCode);

    // Login via UI to ensure frontend session state is established
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(username, password);
    await page.waitForURL(BASE_URL + '/general', { timeout: 10000 });

    const userContext: UserContext = {
      page,
      token,
      user,
      api,
      username,
      password,
    };

    await use(userContext);

    // Cleanup
    await context.close();
  },

  /**
   * Two users fixture - admin and member in separate contexts
   * 
   * Useful for testing interactions between users (e.g., DMs, mentions).
   * Both users are in separate browser contexts with independent sessions.
   */
  twoUsers: async ({ browser, api }, use) => {
    // Ensure bootstrap admin exists and is valid
    const bootstrap = await ensureBootstrapAdmin(api);
    
    // Create first user (will be admin)
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    const adminUsername = generateUsername('admin');
    const adminPassword = 'adminpass123';
    const adminInvite = await createInviteIfRequired(api, bootstrap.token);
    const { token: adminToken, user: adminUser } = await api.signup(adminUsername, 'Admin User', adminPassword, adminInvite);

    const adminLoginPage = new LoginPage(adminPage);
    await adminLoginPage.goto();
    await adminLoginPage.login(adminUsername, adminPassword);
    await adminPage.waitForURL(BASE_URL + '/general', { timeout: 10000 });

    // Create invite for member (from the new admin user)
    const inviteCode = await createInviteIfRequired(api, adminToken);
    
    // Create second user (member)
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    
    const memberUsername = generateUsername('member');
    const memberPassword = 'memberpass123';
    const { token: memberToken, user: memberUser } = await api.signup(memberUsername, 'Member User', memberPassword, inviteCode);

    const memberLoginPage = new LoginPage(memberPage);
    await memberLoginPage.goto();
    await memberLoginPage.login(memberUsername, memberPassword);
    await memberPage.waitForURL(BASE_URL + '/general', { timeout: 10000 });

    const adminUserContext: UserContext = {
      page: adminPage,
      token: adminToken,
      user: adminUser,
      api,
      username: adminUsername,
      password: adminPassword,
    };

    const memberUserContext: UserContext = {
      page: memberPage,
      token: memberToken,
      user: memberUser,
      api,
      username: memberUsername,
      password: memberPassword,
    };

    await use({ admin: adminUserContext, member: memberUserContext });

    // Cleanup
    await adminContext.close();
    await memberContext.close();
  },

  chatPage: async ({ page }, use) => {
    await use(new ChatPage(page));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },
});

export { expect };
export { generateUsername } from './auth';
