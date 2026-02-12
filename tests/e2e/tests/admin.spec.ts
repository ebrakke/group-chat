import { test, expect, generateUsername } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

const BASE_URL = 'http://localhost:3002';

test.describe('Admin', () => {
  test('Admin sees Admin Panel link', async ({ adminUser }) => {
    await expect(adminUser.page.getByRole('link', { name: 'Admin Panel' })).toBeVisible();
  });

  test('Regular member does not see Admin Panel', async ({ memberUser }) => {
    await expect(memberUser.page.getByRole('link', { name: 'Admin Panel' })).toHaveCount(0);
  });

  test('Admin generates invite links', async ({ adminUser }) => {
    const { page } = adminUser;

    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

    await page.getByRole('button', { name: /Generate Invite/i }).click();
    await expect(page.locator('code').first()).toBeVisible({ timeout: 5000 });

    const codeText = (await page.locator('code').first().textContent()) || '';
    expect(codeText.length).toBeGreaterThan(0);
  });

  test('Admin sees list of active invites', async ({ adminUser }) => {
    const { page, token, api } = adminUser;

    await api.createInvite(token);
    await api.createInvite(token);

    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

    const inviteCodes = page.locator('code');
    await expect(inviteCodes.first()).toBeVisible();
    expect(await inviteCodes.count()).toBeGreaterThan(0);
  });

  test.fixme('Admin sees user list', 'App bug: /admin page currently has no user management UI/listing.');

  test.skip('Admin promotes a member to admin', 'Feature not implemented: admin role management UI missing.');

  test.skip('Admin removes a user', 'Feature not implemented: user removal UI missing.');

  test('Admin deletes another user\'s message', async ({ twoUsers }) => {
    const { admin, member } = twoUsers;

    const chatPageMember = new ChatPage(member.page);
    const messageContent = 'Inappropriate content';
    await chatPageMember.messageInput.fill(messageContent);
    await chatPageMember.sendButton.click();

    await expect(admin.page.locator('.prose', { hasText: messageContent }).first()).toBeVisible({ timeout: 5000 });

    const messageContainer = admin.page.locator('div.group', { hasText: messageContent }).first();
    await messageContainer.hover();

    const deleteBtn = messageContainer.getByRole('button', { name: /Delete/i }).first();
    await expect(deleteBtn).toBeVisible();

    admin.page.once('dialog', (dialog) => dialog.accept());
    await deleteBtn.click();

    await expect(admin.page.locator('.prose', { hasText: messageContent })).toHaveCount(0, { timeout: 5000 });
    await expect(member.page.locator('.prose', { hasText: messageContent })).toHaveCount(0, { timeout: 5000 });
  });
});
