import { Hono } from 'hono';

export const inviteRoutes = new Hono();

inviteRoutes.get('/:code', async (c) => c.json({ message: 'Not implemented' }, 501));
inviteRoutes.post('/', async (c) => c.json({ message: 'Not implemented' }, 501));
inviteRoutes.get('/', async (c) => c.json({ message: 'Not implemented' }, 501));
inviteRoutes.delete('/:code', async (c) => c.json({ message: 'Not implemented' }, 501));
