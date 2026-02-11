import { Hono } from 'hono';

export const authRoutes = new Hono();

authRoutes.post('/signup', async (c) => {
  // TODO: Implement signup
  return c.json({ message: 'Not implemented' }, 501);
});

authRoutes.post('/login', async (c) => {
  // TODO: Implement login
  return c.json({ message: 'Not implemented' }, 501);
});

authRoutes.post('/logout', async (c) => {
  // TODO: Implement logout
  return c.json({ message: 'Not implemented' }, 501);
});

authRoutes.get('/me', async (c) => {
  // TODO: Implement get current user
  return c.json({ message: 'Not implemented' }, 501);
});
