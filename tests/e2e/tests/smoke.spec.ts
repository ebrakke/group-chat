import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';
const API_URL = 'http://localhost:4002';

/**
 * Smoke Test Suite
 * 
 * Critical happy path tests that gate PRs.
 * These tests verify core functionality without diving into edge cases.
 */
test.describe('Smoke Tests', () => {
  
  test('Health check - API returns ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
  });

  test('First user signup - fill form, submit, lands in chat', async ({ page }) => {
    // Navigate to signup page
    await page.goto(BASE_URL);
    
    // Fill signup form
    const timestamp = Date.now();
    await page.locator('input[name="username"]').fill(`smoke_user_${timestamp}`);
    await page.locator('input[name="displayName"]').fill('Smoke Test User');
    await page.locator('input[name="password"]').fill('SecurePassword123!');
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Should land in chat interface
    await expect(page).toHaveURL(BASE_URL + '/', { timeout: 10000 });
    await expect(page.locator('text=Relay Chat').first()).toBeVisible({ timeout: 5000 });
  });

  test('See #general channel - sidebar shows it, it is selected', async ({ page }) => {
    // Create a new user and land in chat
    await page.goto(BASE_URL);
    const timestamp = Date.now();
    await page.locator('input[name="username"]').fill(`smoke_user_${timestamp}`);
    await page.locator('input[name="displayName"]').fill('Smoke Test User');
    await page.locator('input[name="password"]').fill('SecurePassword123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });
    
    // Verify #general channel exists in sidebar
    const generalChannel = page.locator('nav button:has-text("# general")');
    await expect(generalChannel).toBeVisible({ timeout: 5000 });
    
    // Verify it's selected (usually has an active state/class)
    await expect(generalChannel).toHaveClass(/bg-blue|bg-indigo|active|selected/);
  });

  test('Send a message - type in textarea, click send, message appears', async ({ page }) => {
    // Setup: create user and land in chat
    await page.goto(BASE_URL);
    const timestamp = Date.now();
    await page.locator('input[name="username"]').fill(`smoke_user_${timestamp}`);
    await page.locator('input[name="displayName"]').fill('Smoke Test User');
    await page.locator('input[name="password"]').fill('SecurePassword123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });
    
    // Type a message
    const messageContent = `Smoke test message ${timestamp}`;
    await page.locator('textarea[placeholder*="Message"]').fill(messageContent);
    
    // Click send
    await page.locator('button[type="submit"]:has-text("Send")').click();
    
    // Message should appear in the chat
    await expect(page.locator(`.prose:has-text("${messageContent}")`).first())
      .toBeVisible({ timeout: 5000 });
  });

  test('Page reload keeps session - refresh, still logged in, message still there', async ({ page }) => {
    // Setup: create user, land in chat, send message
    await page.goto(BASE_URL);
    const timestamp = Date.now();
    const messageContent = `Smoke test message ${timestamp}`;
    
    await page.locator('input[name="username"]').fill(`smoke_user_${timestamp}`);
    await page.locator('input[name="displayName"]').fill('Smoke Test User');
    await page.locator('input[name="password"]').fill('SecurePassword123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(BASE_URL + '/', { timeout: 10000 });
    
    // Send a message
    await page.locator('textarea[placeholder*="Message"]').fill(messageContent);
    await page.locator('button[type="submit"]:has-text("Send")').click();
    await expect(page.locator(`.prose:has-text("${messageContent}")`).first())
      .toBeVisible({ timeout: 5000 });
    
    // Reload the page
    await page.reload();
    
    // Should still be logged in (not redirected to signup)
    await expect(page).toHaveURL(BASE_URL + '/', { timeout: 5000 });
    await expect(page.locator('text=Relay Chat').first()).toBeVisible({ timeout: 5000 });
    
    // Message should still be visible
    await expect(page.locator(`.prose:has-text("${messageContent}")`).first())
      .toBeVisible({ timeout: 5000 });
  });
});
