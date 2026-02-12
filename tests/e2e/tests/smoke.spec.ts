import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';
const API_URL = 'http://localhost:4002';

test.describe('Smoke Tests - Critical Happy Path', () => {
  test('1. Health check - API returns ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
  });

  test('2-3. First user signup and lands in chat', async ({ page }) => {
    // Navigate to signup page
    await page.goto(BASE_URL);
    
    // Verify welcome page
    await expect(page.locator('h1', { hasText: 'Welcome to Relay Chat' })).toBeVisible({ timeout: 5000 });

    // Fill and submit signup form
    const username = `smoke_${Date.now()}`;
    await page.locator('#username').fill(username);
    await page.locator('#displayName').fill('Smoke Test');
    await page.locator('#password').fill('SecurePassword123!');
    
    await page.getByRole('button', { name: 'Create Admin Account' }).click();

    // Verify we're in the chat (URL and general channel visible)
    await expect(page).toHaveURL(BASE_URL + '/', { timeout: 10000 });
    await expect(page.locator('h1', { hasText: '# general' })).toBeVisible({ timeout: 10000 });
  });

  test('4-5. See #general channel and session persists on reload', async ({ page }) => {
    // Navigate to signup
    await page.goto(BASE_URL);
    
    // Create account
    const username = `smoke_${Date.now()}`;
    await page.locator('#username').fill(username);
    await page.locator('#displayName').fill('Smoke Test');
    await page.locator('#password').fill('SecurePassword123!');
    await page.getByRole('button', { name: 'Create Admin Account' }).click();

    // Wait for chat to load
    await expect(page).toHaveURL(BASE_URL + '/');
    await expect(page.locator('h1', { hasText: '# general' })).toBeVisible();

    // Reload the page
    await page.reload();

    // Verify still logged in and on chat page
    await expect(page).toHaveURL(BASE_URL + '/');
    await expect(page.locator('h1', { hasText: '# general' })).toBeVisible({ timeout: 5000 });
    
    // Verify user info is still visible (session persisted)
    await expect(page.getByText(username).first()).toBeVisible();
  });
});
