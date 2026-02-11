import { test, expect, generateUsername } from '../fixtures';
import { SignupPage } from '../pages/SignupPage';
import { LoginPage } from '../pages/LoginPage';
import { ChatPage } from '../pages/ChatPage';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto('http://localhost:3002');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should sign up first user as admin', async ({ page }) => {
    const signupPage = new SignupPage(page);
    const chatPage = new ChatPage(page);
    
    await signupPage.gotoFirstUserSignup();
    
    // Should show first user signup form
    await expect(page.locator('h1', { hasText: 'Welcome to Relay Chat' })).toBeVisible();
    await expect(page.locator('text=Create the first admin account')).toBeVisible();
    
    const username = generateUsername('admin');
    const displayName = 'Admin User';
    const password = 'adminpass123';
    
    await signupPage.signupAndWaitForChat(username, displayName, password);
    
    // Should land in chat
    await expect(page.locator('text=Relay Chat')).toBeVisible();
    await expect(page.locator('button:has-text("# general")')).toBeVisible();
  });

  test('should sign up with invite code', async ({ page, api }) => {
    const signupPage = new SignupPage(page);
    
    // First create admin to generate invite
    const adminUsername = generateUsername('admin');
    const adminToken = await api.signup(adminUsername, 'Admin', 'adminpass123');
    const inviteCode = await api.createInvite(adminToken);
    
    // Now signup with invite
    await signupPage.goto(inviteCode);
    
    const username = generateUsername('member');
    const displayName = 'Member User';
    const password = 'memberpass123';
    
    await signupPage.signupAndWaitForChat(username, displayName, password, inviteCode);
    
    // Should land in chat
    await expect(page.locator('text=Relay Chat')).toBeVisible();
  });

  test('should login with existing user', async ({ page, api }) => {
    const loginPage = new LoginPage(page);
    
    // Create user first
    const username = generateUsername('testuser');
    const password = 'testpass123';
    await api.signup(username, 'Test User', password);
    
    // Now login
    await loginPage.goto();
    await loginPage.loginAndWaitForChat(username, password);
    
    // Should be in chat
    await expect(page.locator('text=Relay Chat')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page, api }) => {
    const loginPage = new LoginPage(page);
    
    // Create user first
    const username = generateUsername('testuser');
    await api.signup(username, 'Test User', 'correctpass123');
    
    // Try login with wrong password
    await loginPage.goto();
    await loginPage.login(username, 'wrongpassword');
    
    // Should show error
    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('should logout successfully', async ({ adminUser }) => {
    const chatPage = new ChatPage(adminUser.page);
    
    // Should be logged in
    await expect(adminUser.page.locator('text=Relay Chat')).toBeVisible();
    
    // Click logout
    await chatPage.logoutButton.click();
    
    // Should redirect to login
    await adminUser.page.waitForURL(/login/, { timeout: 5000 });
    await expect(adminUser.page.locator('button[type="submit"]')).toBeVisible();
  });
});
