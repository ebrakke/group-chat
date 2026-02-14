import { test, expect } from '../fixtures';

test.describe('Messaging', () => {
  test('User sends a message (request succeeds)', async ({ memberUser }) => {
    const { page } = memberUser;
    const messageContent = `hello-${Date.now()}`;

    const responsePromise = page.waitForResponse((r: any) =>
      r.request().method() === 'POST' && /\/api\/v1\/channels\/[^/]+\/messages$/.test(r.url())
    );

    const input = page.locator('textarea[placeholder*="Message"]').first();
    const send = page.locator('button[type="submit"]:has-text("Send")').first();

    await input.fill(messageContent);
    await expect(send).toBeEnabled();
    await send.click();

    const response = await responsePromise;
    expect(response.status()).toBe(201);
    await expect(input).toHaveValue('');
  });

  test('User sends a message with Enter key', async ({ memberUser }) => {
    const { page } = memberUser;

    const responsePromise = page.waitForResponse((r: any) =>
      r.request().method() === 'POST' && /\/api\/v1\/channels\/[^/]+\/messages$/.test(r.url())
    );

    const input = page.locator('textarea[placeholder*="Message"]').first();
    await input.fill(`enter-${Date.now()}`);
    await input.press('Enter');

    const response = await responsePromise;
    expect(response.status()).toBe(201);
  });

  test('Shift+Enter creates a new line instead of sending', async ({ memberUser }) => {
    const { page } = memberUser;
    const input = page.locator('textarea[placeholder*="Message"]').first();

    await input.fill('Line 1');
    await input.press('Shift+Enter');
    await input.type('Line 2');

    await expect(input).toHaveValue(/Line 1\nLine 2/);
  });

  test('Cannot send an empty message', async ({ memberUser }) => {
    const { page } = memberUser;
    const input = page.locator('textarea[placeholder*="Message"]').first();
    const send = page.locator('button[type="submit"]:has-text("Send")').first();

    await input.clear();
    await expect(send).toBeDisabled();
  });
});
