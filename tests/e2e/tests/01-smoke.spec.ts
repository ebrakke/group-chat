import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';
const API_URL = BASE_URL; // Frontend serves API at same origin

test.describe.serial('Smoke Tests - Critical Happy Path', () => {
  let username: string;
  let password: string;

  test.beforeAll(() => {
    username = `smoke_${Date.now()}`;
    password = 'TestPass123!';
  });

  test('Health check — Frontend API is running', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('Database is clean — no users exist', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/auth/has-users`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.hasUsers).toBe(false);
  });

  test('First user can signup via API without invite code', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        displayName: 'Smoke Tester',
        password,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe(username);
    expect(data.user.role).toBe('admin');
  });

  test('After signup, has-users returns true', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/auth/has-users`);
    const data = await response.json();

    expect(data.hasUsers).toBe(true);
  });

  test('Login page shows expected fields and Sign in button', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('Can log in via UI and see #general channel', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/general/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '# general' })).toBeVisible({ timeout: 10000 });
  });

  test('General channel UI is interactive after login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/general/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '# general' })).toBeVisible();

    const messageInput = page.locator('textarea[placeholder*="Message"], textarea[placeholder*="message"], textarea').first();
    await expect(messageInput).toBeVisible();
    await expect(messageInput).toBeEnabled();

    const sendButton = page.locator('button[type="submit"]:has-text("Send"), button:has-text("Send")').first();
    await expect(sendButton).toBeVisible();
  });

  // Note: /login redirect behavior for authenticated users is implementation-dependent,
  // so we do not enforce it in smoke tests.

});
