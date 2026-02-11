import { Hono } from 'hono';

export const userRoutes = new Hono();

userRoutes.get('/', async (c) => c.json({ message: 'Not implemented' }, 501));
userRoutes.patch('/me', async (c) => c.json({ message: 'Not implemented' }, 501));
userRoutes.patch('/:id/role', async (c) => c.json({ message: 'Not implemented' }, 501));
userRoutes.delete('/:id', async (c) => c.json({ message: 'Not implemented' }, 501));
