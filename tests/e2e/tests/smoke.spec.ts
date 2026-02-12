import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';
const API_URL = 'http://localhost:4002';

test.describe.serial('Smoke Tests - Critical Happy Path', () => {
  let username: string;
  let password: string;

  test.beforeAll(() => {
    username = `smoke_${Date.now()}`;
    password = 'TestPass123!';
  });

  test('Health check — API is running', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('First user signup — becomes admin, lands in chat', async ({ page }) => {
    await page.goto(BASE_URL);

    // First user sees the welcome signup form
    await expect(page.getByText('Welcome to Relay Chat')).toBeVisible({ timeout: 10000 });

    // Fill signup form
    await page.locator('#username').fill(username);
    await page.locator('#displayName').fill('Smoke Tester');
    await page.locator('#password').fill(password);

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

    // Should land in chat with #general visible
    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });
  });

  test('Can see #general channel in sidebar', async ({ page }) => {
    // Login
    await page.goto(BASE_URL + '/login');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /log in/i }).click();

    // Verify #general in sidebar
    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });
  });

  test('Can send a message', async ({ page }) => {
    // Login
    await page.goto(BASE_URL + '/login');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });

    // Type and send a message
    const msg = `Smoke test ${Date.now()}`;
    await page.locator('textarea').fill(msg);
    await page.getByRole('button', { name: /send/i }).click();

    // Message should appear in the list
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10000 });
  });

  test('Session persists after reload', async ({ page }) => {
    // Login
    await page.goto(BASE_URL + '/login');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();

    // Still in chat
    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });
  });
});
