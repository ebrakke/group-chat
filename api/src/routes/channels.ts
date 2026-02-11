import { Hono } from 'hono';

export const channelRoutes = new Hono();

channelRoutes.get('/', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.post('/', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.patch('/:id', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.delete('/:id', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.get('/:id/members', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.get('/:id/messages', async (c) => c.json({ message: 'Not implemented' }, 501));
channelRoutes.post('/:id/messages', async (c) => c.json({ message: 'Not implemented' }, 501));
