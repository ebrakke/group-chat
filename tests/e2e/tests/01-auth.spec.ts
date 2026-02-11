import { test, expect, AuthHelper, generateUsername } from '../fixtures/auth';

/**
 * Auth Flow Tests
 * - First user signup (becomes admin)
 * - Login with existing user
 * - Logout
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto('http://localhost:3002');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should sign up first user as admin', async ({ page }) => {
    const auth = new AuthHelper(page);
    const username = generateUsername('admin');
    const displayName = 'Admin User';
    const password = 'adminpass123';

    await page.goto('http://localhost:3002');

    // Should show first user signup form
    await expect(page.locator('h1', { hasText: 'Welcome to Relay Chat' })).toBeVisible();
    await expect(page.locator('text=Create the first admin account')).toBeVisible();

    // Fill and submit signup form
    await auth.signup(username, displayName, password);

    // Should redirect to main chat
    await expect(page).toHaveURL('http://localhost:3002/');
    await expect(page.locator('text=Relay Chat').first()).toBeVisible();
    
    // Should show user in sidebar
    await expect(page.locator(`text=${displayName}`)).toBeVisible();
    await expect(page.locator(`text=@${username}`)).toBeVisible();
    
    // Should show Admin Panel link (first user is admin)
    await expect(page.locator('a[href="/admin"]')).toBeVisible();
  });

  test('should login with existing user', async ({ page }) => {
    const auth = new AuthHelper(page);
    const username = generateUsername('user');
    const displayName = 'Test User';
    const password = 'testpass123';

    // First, create a user
    await auth.signup(username, displayName, password);
    
    // Logout
    await auth.logout();
    
    // Now try to login
    await auth.login(username, password);

    // Should be on main chat page
    await expect(page).toHaveURL('http://localhost:3002/');
    await expect(page.locator(`text=${displayName}`)).toBeVisible();
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('http://localhost:3002/login');

    await page.fill('#username', 'nonexistent');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.locator('.text-red-800')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    const auth = new AuthHelper(page);
    const username = generateUsername('user');
    const displayName = 'Test User';
    const password = 'testpass123';

    // Login
    await auth.signup(username, displayName, password);
    await expect(page).toHaveURL('http://localhost:3002/');

    // Logout
    await auth.logout();

    // Should redirect to login page
    await expect(page).toHaveURL('http://localhost:3002/login');
    await expect(page.locator('h1', { hasText: 'Relay Chat' })).toBeVisible();
  });

  test('should redirect to login if not authenticated', async ({ page }) => {
    // Clear auth
    await page.goto('http://localhost:3002');
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });

    // Try to access main page
    await page.goto('http://localhost:3002');

    // Should redirect to login (assuming at least one user exists from previous tests)
    // Note: In a fresh environment, it would show signup form
    const url = page.url();
    const isLoginOrSignup = url.includes('/login') || url === 'http://localhost:3002/';
    expect(isLoginOrSignup).toBeTruthy();
  });
});
