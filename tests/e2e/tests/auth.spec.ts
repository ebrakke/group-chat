import { test, expect } from '../fixtures';

const BASE_URL = 'http://localhost:3002';

test.describe('Authentication', () => {
  test('Admin panel is accessible to admin users', async ({ adminUser }) => {
    const { page } = adminUser;
    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  });

  test.skip('User logs in with valid credentials', 'Login flow tested via UI integration; fixtures need refinement.');
  test.skip('User stays logged in after page refresh', 'Session persistence tested via UI integration; fixtures need refinement.');
  test.skip('User logs out', 'Logout flow tested via UI integration; fixtures need refinement.');
});
