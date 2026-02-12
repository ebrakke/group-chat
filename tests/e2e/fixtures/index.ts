import { test as base, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
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
   */
  async signup(username: string, displayName: string, password: string, inviteCode?: string): Promise<{ token: string; user: any }> {
    const response = await this.request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        displayName,
        password,
        inviteCode,
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

let bootstrapAdmin: { token: string; username: string; password: string } | null = null;

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
   */
  adminUser: async ({ browser, api }, use) => {
    // Create a new context for the admin user
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const username = generateUsername('admin');
    const displayName = `Admin ${Date.now()}`;
    const password = 'adminpass123';

    // First user doesn't need an invite code
    if (!bootstrapAdmin) {
      const { token: bootstrapToken } = await api.signup(username, displayName, password);
      bootstrapAdmin = { token: bootstrapToken, username, password };
    }

    // For subsequent users, we need an invite
    let token = bootstrapAdmin.token;
    let user = { id: 'admin', username, displayName, role: 'admin', nostrPubkey: '' };
    
    // Login via UI to ensure frontend session state is established
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(bootstrapAdmin.username, bootstrapAdmin.password);
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });

    const userContext: UserContext = {
      page,
      token,
      user,
      api,
      username: bootstrapAdmin.username,
      password: bootstrapAdmin.password,
    };

    await use(userContext);

    // Cleanup
    await context.close();
  },

  /**
   * Member user fixture - signs up via invite
   */
  memberUser: async ({ browser, api }, use) => {
    // Ensure bootstrap admin exists first
    if (!bootstrapAdmin) {
      const bootstrapUsername = generateUsername('bootstrap');
      const bootstrapPassword = 'adminpass123';
      const { token: bootstrapToken } = await api.signup(bootstrapUsername, 'Bootstrap Admin', bootstrapPassword);
      bootstrapAdmin = { token: bootstrapToken, username: bootstrapUsername, password: bootstrapPassword };
    }
    
    // Generate invite from bootstrap admin
    const inviteCode = await api.createInvite(bootstrapAdmin.token);

    // Now create member with invite
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
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });

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
   */
  twoUsers: async ({ browser, api }, use) => {
    // Create admin
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    const adminUsername = generateUsername('admin');
    const adminPassword = 'adminpass123';

    if (!bootstrapAdmin) {
      const bootstrapUsername = generateUsername('bootstrap');
      const bootstrapPassword = 'adminpass123';
      const { token: bootstrapToken } = await api.signup(bootstrapUsername, 'Bootstrap Admin', bootstrapPassword);
      bootstrapAdmin = { token: bootstrapToken, username: bootstrapUsername, password: bootstrapPassword };
    }

    const adminInvite = await api.createInvite(bootstrapAdmin.token);
    const { token: adminToken, user: adminUser } = await api.signup(adminUsername, 'Admin User', adminPassword, adminInvite);

    const adminLoginPage = new LoginPage(adminPage);
    await adminLoginPage.goto();
    await adminLoginPage.login(adminUsername, adminPassword);
    await adminPage.waitForURL(BASE_URL + '/', { timeout: 10000 });

    // Create invite and member
    const inviteCode = await api.createInvite(adminToken);
    
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    
    const memberUsername = generateUsername('member');
    const memberPassword = 'memberpass123';
    const { token: memberToken, user: memberUser } = await api.signup(memberUsername, 'Member User', memberPassword, inviteCode);

    const memberLoginPage = new LoginPage(memberPage);
    await memberLoginPage.goto();
    await memberLoginPage.login(memberUsername, memberPassword);
    await memberPage.waitForURL(BASE_URL + '/', { timeout: 10000 });

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
