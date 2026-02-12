import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';

test.describe.serial('Smoke Tests - Critical Happy Path', () => {
  let username: string;
  let password: string;

  test.beforeAll(() => {
    username = `smoke_${Date.now()}`;
    password = 'TestPass123!';
  });

  test('Signup page shows expected welcome form', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Welcome to Relay Chat')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible();
  });

  test('First user signup lands in chat with #general visible', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.locator('#username').fill(username);
    await page.locator('#displayName').fill('Smoke Tester');
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });
  });

  test('Login page shows expected fields and Sign in button', async ({ page }) => {
    await page.goto(BASE_URL + '/login');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('Can log in and see #general', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('# general')).toBeVisible({ timeout: 10000 });
  });
});
