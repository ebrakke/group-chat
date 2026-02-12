import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { channelRoutes } from './routes/channels.js';
import { messageRoutes } from './routes/messages.js';
import { userRoutes } from './routes/users.js';
import { inviteRoutes } from './routes/invites.js';
import { uploadRoutes } from './routes/upload.js';
import { initDatabase } from './db/schema.js';
import { NostrClient } from './nostr/client.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { hasUsers } from './lib/users.js';
import { channelExists, createChannelRecord } from './lib/channels.js';
import { WebSocketServer } from 'ws';
import { WebSocketHandler } from './websocket/handler.js';
const app = new Hono();

// Enable CORS for frontend
app.use('/*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Initialize database
initDatabase();

// Initialize Nostr client
let nostrClient: NostrClient;
let wsHandler: WebSocketHandler;

async function initNostrClient() {
  const relayUrl = process.env.RELAY_URL || 'ws://localhost:3334';
  
  // Get server private key from environment or generate a new one
  let serverPrivkey: Uint8Array;
  const serverPrivkeyHex = process.env.SERVER_PRIVKEY;
  
  if (serverPrivkeyHex) {
    // Use existing keypair from environment
    serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
  } else {
    // Generate a new keypair (fallback for development)
    console.warn('WARNING: SERVER_PRIVKEY not set, generating ephemeral keypair');
    serverPrivkey = generateSecretKey();
  }
  
  const serverPubkey = getPublicKey(serverPrivkey);
  console.log('Server Nostr pubkey:', serverPubkey);
  
  nostrClient = new NostrClient({
    relayUrl,
    serverPrivkey,
  });
  
  try {
    await nostrClient.connect();
    console.log('Connected to Nostr relay');
    
    // Initialize WebSocket handler after Nostr client is connected
    wsHandler = new WebSocketHandler(nostrClient);
  } catch (err) {
    console.error('Failed to connect to Nostr relay:', err);
    console.log('API will continue without relay connection');
  }
}

// Initialize #general channel on first startup
async function initDefaultChannel() {
  if (!channelExists('general')) {
    console.log('Creating default #general channel');
    createChannelRecord('general', 'general', 'Default channel for everyone');
    
    // Create the group on the relay
    if (nostrClient && nostrClient.isConnected()) {
      try {
        const serverPrivkeyHex = process.env.SERVER_PRIVKEY;
        if (!serverPrivkeyHex) {
          console.error('Cannot create group: SERVER_PRIVKEY not set');
          return;
        }
        
        const serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
        
        console.log('Creating #general group on relay...');
        await nostrClient.createGroup('general', serverPrivkey);
        console.log('Created #general group successfully');
        
        console.log('Publishing #general channel metadata...');
        await nostrClient.updateChannelMetadata('general', 'general', 'Default channel for everyone', serverPrivkey);
        console.log('Published #general channel metadata successfully');
      } catch (err) {
        console.error('Failed to create #general group on relay:', err);
      }
    } else {
      console.warn('Nostr client not connected, cannot create #general group on relay');
    }
  }
}

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
const api = new Hono();
api.get('/health', (c) => c.json({ status: 'ok' })); // Health check at /api/v1/health
api.route('/auth', authRoutes);
api.route('/channels', channelRoutes);
api.route('/messages', messageRoutes);
api.route('/users', userRoutes);
api.route('/invites', inviteRoutes);
api.route('/upload', uploadRoutes);

app.route('/api/v1', api);

// Export Nostr client getter
export function getNostrClient(): NostrClient {
  return nostrClient;
}

// Export WebSocket handler getter
export function getWebSocketHandler(): WebSocketHandler | undefined {
  return wsHandler;
}

// Start server
const port = parseInt(process.env.PORT || '4000');

async function start() {
  await initNostrClient();
  await initDefaultChannel();
  
  console.log(`API server starting on port ${port}`);
  
  const server = serve({
    fetch: app.fetch,
    port,
  });
  
  // Attach WebSocket server to Hono's HTTP server
  const wss = new WebSocketServer({ server: server as any, path: '/ws' });
  
  wss.on('connection', (ws, request) => {
    if (wsHandler) {
      wsHandler.handleConnection(ws, request);
    } else {
      console.error('WebSocket handler not initialized');
      ws.close();
    }
  });
  
  console.log(`Server listening on port ${port}`);
  console.log(`HTTP API: http://localhost:${port}`);
  console.log(`WebSocket: ws://localhost:${port}/ws`);
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
