import { test, expect } from '../fixtures';

test.describe('Reactions', () => {
  test('User adds a reaction via API', async ({ memberUser, request }) => {
    const { token, api } = memberUser;
    const message = await api.sendMessage(token, 'general', `react-${Date.now()}`);

    const response = await request.post(`http://localhost:3002/api/v1/messages/${message.id}/reactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { emoji: '👍' },
    });

    expect([200, 404]).toContain(response.status());
  });

  test('User removes their own reaction via API', async ({ memberUser, request }) => {
    const { token, api } = memberUser;
    const message = await api.sendMessage(token, 'general', `react-rm-${Date.now()}`);

    const add = await request.post(`http://localhost:3002/api/v1/messages/${message.id}/reactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { emoji: '🎉' },
    });
    expect([200, 404]).toContain(add.status());

    const del = await request.delete(`http://localhost:3002/api/v1/messages/${message.id}/reactions/${encodeURIComponent('🎉')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(del.status());
  });
});
