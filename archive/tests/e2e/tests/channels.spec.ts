import { test, expect } from '../fixtures';

test.describe('Channels', () => {
  test('General channel exists by default', async ({ memberUser }) => {
    const { page } = memberUser;

    const generalBtn = page.locator('button:has-text("# general")').first();
    await expect(generalBtn).toBeVisible();

    const classList = await generalBtn.getAttribute('class');
    expect(classList || '').toMatch(/bg-blue-100|active|selected/);
  });

  test('User sees API-created channels in sidebar', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    const id = Date.now();

    await api.createChannel(token, `random-${id}`, 'Random discussion');
    await api.createChannel(token, `dev-${id}`, 'Development talk');

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator(`button:has-text("# random-${id}")`).first()).toBeVisible();
    await expect(page.locator(`button:has-text("# dev-${id}")`).first()).toBeVisible();
  });

  test('User switches between channels', async ({ memberUser }) => {
    const { page, token, api } = memberUser;
    const channel = `random-${Date.now()}`;

    await api.createChannel(token, channel, 'Random channel');
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.click(`button:has-text("# ${channel}")`);

    await expect(page.locator(`h1:has-text("# ${channel}")`).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${channel}$`));

    const input = page.locator('textarea[placeholder*="Message"]').first();
    await expect(input).toHaveAttribute('placeholder', new RegExp(channel));
  });

  test('Create/Edit/Delete channel UI is not currently exposed in path-based layout', async ({ memberUser }) => {
    const { page } = memberUser;

    await expect(page.locator('button[title="Create channel"]')).toHaveCount(0);
    await expect(page.locator('button[title="Channel settings"]')).toHaveCount(0);
  });
});
