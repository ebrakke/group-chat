import { Hono } from 'hono';

export const messageRoutes = new Hono();

messageRoutes.patch('/:id', async (c) => c.json({ message: 'Not implemented' }, 501));
messageRoutes.delete('/:id', async (c) => c.json({ message: 'Not implemented' }, 501));
messageRoutes.get('/:id/thread', async (c) => c.json({ message: 'Not implemented' }, 501));
messageRoutes.post('/:id/thread', async (c) => c.json({ message: 'Not implemented' }, 501));
messageRoutes.post('/:id/reactions', async (c) => c.json({ message: 'Not implemented' }, 501));
messageRoutes.delete('/:id/reactions/:emoji', async (c) => c.json({ message: 'Not implemented' }, 501));
