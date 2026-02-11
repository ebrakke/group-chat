import { test as base, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import { AuthHelper, generateUsername } from './auth';
import { ChatPage } from '../pages/ChatPage';
import { LoginPage } from '../pages/LoginPage';
import { SignupPage } from '../pages/SignupPage';

const API_URL = process.env.VITE_API_URL || 'http://localhost:4002';
const BASE_URL = 'http://localhost:3002';

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
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
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
   * Get user info
   */
  async getUser(token: string) {
    const response = await this.request.get(`${API_URL}/api/v1/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Signup via API
   */
  async signup(username: string, displayName: string, password: string, inviteCode?: string) {
    const response = await this.request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        displayName,
        password,
        inviteCode,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return data.token;
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

    // First user becomes admin automatically
    const token = await api.signup(username, displayName, password);
    const user = await api.getUser(token);

    // Set auth in page
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

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
   * Member user fixture - signs up via invite
   */
  memberUser: async ({ browser, api }, use) => {
    // First create an admin to generate invite
    const adminUsername = generateUsername('admin');
    const adminToken = await api.signup(adminUsername, 'Admin', 'adminpass123');
    const inviteCode = await api.createInvite(adminToken);

    // Now create member with invite
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const username = generateUsername('member');
    const displayName = `Member ${Date.now()}`;
    const password = 'memberpass123';

    const token = await api.signup(username, displayName, password, inviteCode);
    const user = await api.getUser(token);

    // Set auth in page
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token, user }
    );

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

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
    const adminToken = await api.signup(adminUsername, 'Admin User', adminPassword);
    const adminUser = await api.getUser(adminToken);

    await adminPage.goto(BASE_URL);
    await adminPage.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token: adminToken, user: adminUser }
    );
    await adminPage.goto(BASE_URL);
    await adminPage.waitForLoadState('networkidle');

    // Create invite and member
    const inviteCode = await api.createInvite(adminToken);
    
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    
    const memberUsername = generateUsername('member');
    const memberPassword = 'memberpass123';
    const memberToken = await api.signup(memberUsername, 'Member User', memberPassword, inviteCode);
    const memberUser = await api.getUser(memberToken);

    await memberPage.goto(BASE_URL);
    await memberPage.evaluate(
      ({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      },
      { token: memberToken, user: memberUser }
    );
    await memberPage.goto(BASE_URL);
    await memberPage.waitForLoadState('networkidle');

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
