import { Hono } from 'hono';

export const uploadRoutes = new Hono();

uploadRoutes.post('/', async (c) => c.json({ message: 'Not implemented' }, 501));
