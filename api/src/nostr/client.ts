import WebSocket from 'ws';
import { SimplePool, Event, EventTemplate, finalizeEvent, nip42 } from 'nostr-tools';

export interface NostrClientConfig {
  relayUrl: string;
  serverPrivkey: Uint8Array;
}

export class NostrClient {
  private relayUrl: string;
  private serverPrivkey: Uint8Array;
  private ws: WebSocket | null = null;
  private pool: SimplePool | null = null;
  private connected: boolean = false;

  constructor(config: NostrClientConfig) {
    this.relayUrl = config.relayUrl;
    this.serverPrivkey = config.serverPrivkey;
  }

  /**
   * Connect to the Nostr relay
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.relayUrl);
        
        this.ws.on('open', () => {
          console.log(`Connected to relay at ${this.relayUrl}`);
          this.connected = true;
          resolve();
        });
        
        this.ws.on('error', (err) => {
          console.error('Relay WebSocket error:', err);
          if (!this.connected) {
            reject(err);
          }
        });
        
        this.ws.on('close', () => {
          console.log('Relay connection closed');
          this.connected = false;
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });
        
        // Initialize pool for easier event handling
        this.pool = new SimplePool();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming messages from relay
   */
  private handleMessage(message: string): void {
    try {
      const [type, ...rest] = JSON.parse(message);
      
      if (type === 'AUTH') {
        // Handle NIP-42 AUTH challenge
        this.handleAuthChallenge(rest[0]);
      } else if (type === 'EVENT') {
        // Handle event subscription
        const [subId, event] = rest;
        console.log('Received event:', event);
      } else if (type === 'EOSE') {
        // End of stored events
        console.log('End of stored events for subscription:', rest[0]);
      } else if (type === 'OK') {
        // Event publication confirmation
        const [eventId, success, message] = rest;
        if (success) {
          console.log(`Event ${eventId} published successfully`);
        } else {
          console.error(`Event ${eventId} failed: ${message}`);
        }
      } else if (type === 'NOTICE') {
        console.log('Relay notice:', rest[0]);
      }
    } catch (err) {
      console.error('Error parsing relay message:', err);
    }
  }

  /**
   * Handle NIP-42 AUTH challenge
   */
  private async handleAuthChallenge(challenge: string): Promise<void> {
    try {
      const authEventTemplate = nip42.makeAuthEvent(this.relayUrl, challenge);
      const authEvent = finalizeEvent(authEventTemplate, this.serverPrivkey);
      
      this.send(['AUTH', authEvent]);
      console.log('Sent AUTH response to relay');
    } catch (err) {
      console.error('Error handling AUTH challenge:', err);
    }
  }

  /**
   * Send a message to the relay
   */
  private send(message: any[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket not open');
      return;
    }
    
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Publish an event to the relay
   */
  async publishEvent(template: EventTemplate, privkey: Uint8Array): Promise<Event> {
    const event = finalizeEvent(template, privkey);
    
    this.send(['EVENT', event]);
    
    return event;
  }

  /**
   * Subscribe to events
   */
  subscribe(subId: string, filters: any[]): void {
    this.send(['REQ', subId, ...filters]);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subId: string): void {
    this.send(['CLOSE', subId]);
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
    }
    if (this.pool) {
      this.pool.close([this.relayUrl]);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Create a NIP-29 channel metadata event (kind 39000)
   */
  async createChannel(
    groupId: string,
    name: string,
    description: string,
    privkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 39000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', groupId],
        ['name', name],
        ['about', description],
      ],
      content: '',
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Publish a user profile event (kind 0)
   * 
   * WARNING: Kind 0 events should NOT be published to NIP-29 group relays.
   * NIP-29 relays only accept group-scoped events with an 'h' tag.
   * This method is kept for potential future use with non-NIP-29 relays.
   */
  async publishProfile(
    displayName: string,
    avatar: string | null,
    privkey: Uint8Array
  ): Promise<Event> {
    const metadata = {
      name: displayName,
      ...(avatar && { picture: avatar }),
    };
    
    const template: EventTemplate = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(metadata),
    };
    
    return this.publishEvent(template, privkey);
  }
}
