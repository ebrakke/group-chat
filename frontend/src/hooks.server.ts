import type { Handle } from '@sveltejs/kit';
import { initDatabase } from '$lib/server/db/schema.js';
import { NostrClient } from '$lib/server/nostr/client.js';
import { WebSocketHandler } from '$lib/server/websocket/handler.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { channelExists, createChannelRecord } from '$lib/server/lib/channels.js';
import { setNostrClient, setWebSocketHandler } from '$lib/server/globals.js';

let initialized = false;
let initPromise: Promise<void> | null = null;

async function initialize() {
  if (initialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    console.log('Initializing server...');

    // Initialize database
    initDatabase();

    // Initialize Nostr client
    const relayUrl = process.env.RELAY_URL || 'ws://localhost:3334';
    
    let serverPrivkey: Uint8Array;
    const serverPrivkeyHex = process.env.SERVER_PRIVKEY;
    
    if (serverPrivkeyHex) {
      serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
    } else {
      console.warn('WARNING: SERVER_PRIVKEY not set, generating ephemeral keypair');
      serverPrivkey = generateSecretKey();
    }
    
    const serverPubkey = getPublicKey(serverPrivkey);
    console.log('Server Nostr pubkey:', serverPubkey);
    
    const nostrClient = new NostrClient({
      relayUrl,
      serverPrivkey,
    });
    
    setNostrClient(nostrClient);
    
    // Always create WebSocket handler, even if relay connection fails
    const wsHandler = new WebSocketHandler(nostrClient);
    setWebSocketHandler(wsHandler);
    
    try {
      await nostrClient.connect();
      console.log('Connected to Nostr relay');
      
      // Initialize #general channel
      if (!channelExists('general')) {
        console.log('Creating default #general channel');
        createChannelRecord('general', 'general', 'Default channel for everyone');
        
        if (nostrClient.isConnected() && serverPrivkeyHex) {
          try {
            const serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
            console.log('Creating #general group on relay...');
            await nostrClient.createGroup('general', serverPrivkey);
            await nostrClient.updateChannelMetadata('general', 'general', 'Default channel for everyone', serverPrivkey);
            console.log('Created #general group successfully');
          } catch (err) {
            console.error('Failed to create #general group:', err);
          }
        }
      }
      
      initialized = true;
      console.log('Server initialization complete');
    } catch (err) {
      console.error('Failed to connect to Nostr relay:', err);
      console.log('API will continue without relay connection');
      initialized = true; // Mark as initialized even if relay connection failed
    }
  })();
  
  return initPromise;
}

// Start initialization immediately at module load
initialize().catch(err => {
  console.error('Failed to initialize server:', err);
});

// No more proxying - all API routes are handled by SvelteKit
export const handle: Handle = async ({ event, resolve }) => {
  // Ensure initialization is complete
  await initialize();
  
  return resolve(event);
};
