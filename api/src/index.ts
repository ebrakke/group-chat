import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth.js';
import { channelRoutes } from './routes/channels.js';
import { messageRoutes } from './routes/messages.js';
import { userRoutes } from './routes/users.js';
import { inviteRoutes } from './routes/invites.js';
import { uploadRoutes } from './routes/upload.js';
import { initDatabase } from './db/schema.js';

const app = new Hono();

// Initialize database
initDatabase();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
const api = new Hono();
api.route('/auth', authRoutes);
api.route('/channels', channelRoutes);
api.route('/messages', messageRoutes);
api.route('/users', userRoutes);
api.route('/invites', inviteRoutes);
api.route('/upload', uploadRoutes);

app.route('/api/v1', api);

const port = parseInt(process.env.PORT || '4000');
console.log(`API server starting on port ${port}`);

serve({ fetch: app.fetch, port });
