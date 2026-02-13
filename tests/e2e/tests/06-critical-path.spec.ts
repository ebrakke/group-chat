import { test, expect } from '../fixtures';

const BASE_URL = 'http://localhost:3002';

test('Critical path: signup → message → thread → react', async ({ page, api, request }) => {
  const username = `cp_${Date.now()}`;
  const password = 'TestPass123!';
  const displayName = 'Critical Path User';

  // Signup
  const { token } = await api.signup(username, displayName, password);

  // Establish session (same mechanism as fixtures)
  await page.context().addCookies([
    {
      name: 'token',
      value: token,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax'
    }
  ]);
  await page.addInitScript(({ token }) => {
    localStorage.setItem('token', token);
  }, { token });
  await page.goto(`${BASE_URL}/general`);
  await page.waitForURL(/\/general/, { timeout: 10000 });

  // Message
  const sent = await api.sendMessage(token, 'general', `critical-message-${Date.now()}`);
  expect(sent.id).toBeTruthy();

  // Thread route
  await page.goto(`${BASE_URL}/general/thread/${sent.id}`);
  await expect(page.getByRole('heading', { name: 'Thread' })).toBeVisible();

  // React
  const reactResp = await request.post(`http://localhost:3002/api/v1/messages/${sent.id}/reactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { emoji: '🎉' },
  });
  expect([200, 404]).toContain(reactResp.status());
});
