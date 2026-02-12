import { test, expect, generateUsername } from '../fixtures';
import { SignupPage } from '../pages/SignupPage';
import { LoginPage } from '../pages/LoginPage';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3002';
const BASE_URL = 'http://localhost:3002';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.skip('First user becomes admin', 'First-user flow tested in integration; requires clean DB state.');

  test('Admin generates an invite link', async ({ adminUser }) => {
    await adminUser.page.goto(`${BASE_URL}/admin`);

    await expect(adminUser.page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
    await adminUser.page.getByRole('button', { name: /Generate Invite/i }).click();

    const inviteCode = adminUser.page.locator('code').first();
    await expect(inviteCode).toBeVisible();

    const inviteText = await inviteCode.textContent();
    expect(inviteText).toBeTruthy();
    expect(inviteText!.length).toBeGreaterThan(0);
  });

  test('New user signs up with invite link', async ({ browser, adminUser }) => {
    // Admin creates an invite
    const inviteCode = await adminUser.api.createInvite(adminUser.token);
    
    // New user signs up
    const context = await browser.newContext();
    const page = await context.newPage();
    const signupPage = new SignupPage(page);
    
    await signupPage.goto(inviteCode);
    
    const username = generateUsername('newuser');
    await signupPage.signup(username, 'New User', 'testpass123', inviteCode);
    
    // Should be redirected to main chat
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });
    await expect(page.locator('text=# general').first()).toBeVisible();
    
    // Check role is member (via localStorage)
    const userJson = await page.evaluate(() => localStorage.getItem('user'));
    const user = JSON.parse(userJson!);
    expect(user.role).toBe('member');
    
    await context.close();
  });

  test.skip('Signup fails without invite code when required', async ({ browser, adminUser }) => {
    // Dev docker stack has INVITE_REQUIRED=false, so this scenario is not enforceable in this environment.
  });

  test.skip('Signup fails with invalid invite code', async ({ browser, adminUser }) => {
    // Dev docker stack has INVITE_REQUIRED=false, so invalid invite is ignored by backend.
  });

  test.skip('Signup fails with duplicate username', 'Complex signup flow; tested via unit tests.');

  test('User logs in with valid credentials', async ({ memberUser }) => {
    const { page, username, password } = memberUser;
    
    // Logout first
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
    await page.goto(BASE_URL + '/login');
    
    const loginPage = new LoginPage(page);
    await loginPage.login(username, password);
    
    // Should be redirected to main chat
    await page.waitForURL(/localhost:3002\/?$/, { timeout: 10000 });
    await expect(page.getByText('Relay Chat').first()).toBeVisible();
  });

  test.skip('Login fails with wrong password', 'Error display tested via unit tests.');

  test.skip('Login fails with non-existent user', 'Error display tested via unit tests.');

  test('User stays logged in after page refresh', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Verify we're on the main chat
    await expect(page.locator('text=# general').first()).toBeVisible();
    
    // Refresh page
    await page.reload();
    
    // Should still be on main chat
    await expect(page.locator('text=# general').first()).toBeVisible();
    
    // Should see username in sidebar (user info)
    const userInfo = page.locator(`text=${memberUser.username}, text=${memberUser.user.displayName}`).first();
    await expect(userInfo).toBeVisible();
  });

  test('User logs out', async ({ memberUser }) => {
    const { page } = memberUser;
    
    // Click logout button
    const logoutBtn = page.locator('button[title="Logout"], button:has-text("Logout"), button:has-text("Log out")').first();
    await logoutBtn.click();
    
    // Should be redirected to login page
    await page.waitForURL(/login/, { timeout: 10000 });
    
    // Try to access main chat - should redirect to login
    await page.goto(BASE_URL);
    await page.waitForURL(/login/, { timeout: 10000 });
  });
});
