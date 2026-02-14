import WebSocket from 'ws';
import { SimplePool, finalizeEvent, nip42, type Event, type EventTemplate } from 'nostr-tools';

export interface NostrClientConfig {
  relayUrl: string;
  serverPrivkey: Uint8Array;
}

export interface MessageSubscriptionHandler {
  (event: Event): void;
}

export class NostrClient {
  private relayUrl: string;
  private serverPrivkey: Uint8Array;
  private ws: WebSocket | null = null;
  private pool: SimplePool | null = null;
  private connected: boolean = false;
  private subscriptions: Map<string, MessageSubscriptionHandler> = new Map();
  private pendingRequests: Map<string, { resolve: (value: any) => void, reject: (error: any) => void, timeout: NodeJS.Timeout }> = new Map();
  private pendingQueries: Map<string, { events: Event[], resolve: (events: Event[]) => void, timeout: NodeJS.Timeout }> = new Map();

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
        
        // Check if this is for a pending query
        const query = this.pendingQueries.get(subId);
        if (query) {
          query.events.push(event);
        }
        
        // Call subscription handler if exists
        const handler = this.subscriptions.get(subId);
        if (handler) {
          handler(event);
        }
      } else if (type === 'EOSE') {
        // End of stored events
        const subId = rest[0];
        console.log('End of stored events for subscription:', subId);
        
        // Check if this is for a pending query
        const query = this.pendingQueries.get(subId);
        if (query) {
          clearTimeout(query.timeout);
          this.pendingQueries.delete(subId);
          this.unsubscribe(subId);
          query.resolve(query.events);
        }
      } else if (type === 'OK') {
        // Event publication confirmation
        const [eventId, success, message] = rest;
        if (success) {
          console.log(`Event ${eventId} published successfully`);
        } else {
          console.error(`Event ${eventId} failed: ${message}`);
        }
        
        // Resolve pending request
        const pending = this.pendingRequests.get(eventId);
        if (pending) {
          clearTimeout(pending.timeout);
          if (success) {
            pending.resolve({ success: true, eventId });
          } else {
            pending.reject(new Error(message || 'Event publication failed'));
          }
          this.pendingRequests.delete(eventId);
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
   * Publish an event to the relay (with confirmation)
   */
  async publishEvent(template: EventTemplate, privkey: Uint8Array): Promise<Event> {
    const event = finalizeEvent(template, privkey);
    
    return new Promise((resolve, reject) => {
      // Set up timeout for confirmation
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(event.id);
        resolve(event); // Resolve anyway, just assume it worked
      }, 5000);
      
      this.pendingRequests.set(event.id, { resolve: () => resolve(event), reject, timeout });
      
      this.send(['EVENT', event]);
    });
  }

  /**
   * Subscribe to events with a handler
   */
  subscribe(subId: string, filters: any[], handler?: MessageSubscriptionHandler): void {
    if (handler) {
      this.subscriptions.set(subId, handler);
    }
    this.send(['REQ', subId, ...filters]);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId);
    this.send(['CLOSE', subId]);
  }

  /**
   * Query events (returns promise that resolves with array of events)
   */
  async queryEvents(filters: any[], timeoutMs: number = 2000): Promise<Event[]> {
    return new Promise((resolve) => {
      const subId = `query-${Date.now()}-${Math.random()}`;
      const events: Event[] = [];
      
      // Set up timeout as fallback (should hit EOSE before this)
      const timeout = setTimeout(() => {
        console.warn(`Query ${subId} timed out after ${timeoutMs}ms`);
        this.pendingQueries.delete(subId);
        this.unsubscribe(subId);
        resolve(events);
      }, timeoutMs);
      
      // Store in pending queries map
      this.pendingQueries.set(subId, { events, resolve, timeout });
      
      // Send REQ to relay
      this.send(['REQ', subId, ...filters]);
    });
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
   * Create a NIP-29 group (kind 9007 create-group event)
   * This must be done before publishing metadata
   */
  async createGroup(
    groupId: string,
    privkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 9007, // KindSimpleGroupCreateGroup
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['h', groupId],
      ],
      content: '',
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Update a NIP-29 channel metadata event (kind 39000)
   * NOTE: This should only be called AFTER creating the group with createGroup()
   */
  async updateChannelMetadata(
    groupId: string,
    name: string,
    description: string,
    privkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 39000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['h', groupId],  // Group identifier (required for NIP-29)
        ['d', groupId],
        ['name', name],
        ['about', description],
      ],
      content: '',
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Create a NIP-29 channel (create group + set metadata)
   * This is the proper way to create a new group
   */
  async createChannel(
    groupId: string,
    name: string,
    description: string,
    privkey: Uint8Array
  ): Promise<Event> {
    // First create the group
    await this.createGroup(groupId, privkey);
    
    // Then publish metadata
    return this.updateChannelMetadata(groupId, name, description, privkey);
  }

  /**
   * Publish a channel message (NIP-29 kind 9)
   */
  async publishMessage(
    groupId: string,
    content: string,
    privkey: Uint8Array,
    attachments?: any[]
  ): Promise<Event> {
    const tags: string[][] = [
      ['h', groupId],
    ];
    
    // Add imeta tags for attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const imetaTag = [
          'imeta',
          `url ${attachment.url}`,
          `m ${attachment.mimeType}`,
          `size ${attachment.size}`,
        ];
        if (attachment.filename) {
          imetaTag.push(`name ${attachment.filename}`);
        }
        tags.push(imetaTag);
      }
    }
    
    const template: EventTemplate = {
      kind: 9,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Edit a message (publish replacement event)
   */
  async editMessage(
    groupId: string,
    originalEventId: string,
    newContent: string,
    privkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 9,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['h', groupId],
        ['e', originalEventId], // Reference original event
      ],
      content: newContent,
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Delete a message (publish kind 5 deletion event)
   */
  async deleteMessage(
    eventId: string,
    privkey: Uint8Array,
    reason?: string
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', eventId],
      ],
      content: reason || '',
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Add a user to a group (NIP-29 kind 9000 - put-user)
   * This must be called by a group admin
   */
  async addUserToGroup(
    groupId: string,
    userPubkey: string,
    roles: string[],
    adminPrivkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 9000, // KindSimpleGroupPutUser
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['h', groupId],
        ['p', userPubkey, ...roles],  // User pubkey + roles
      ],
      content: '',
    };
    
    return this.publishEvent(template, adminPrivkey);
  }

  /**
   * Get messages for a channel
   */
  async getChannelMessages(
    groupId: string,
    limit: number = 50,
    before?: string
  ): Promise<Event[]> {
    const filter: any = {
      kinds: [9],
      '#h': [groupId],
      limit,
    };
    
    if (before) {
      // Filter by created_at if we have a "before" event ID
      // We'll need to fetch the before event first to get its timestamp
      // For now, we'll just use the ID in the until field (not standard)
      // TODO: Improve pagination by storing timestamps
    }
    
    const events = await this.queryEvents([filter]);
    
    // Sort by created_at descending (newest first)
    events.sort((a, b) => b.created_at - a.created_at);
    
    return events;
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

  /**
   * Start a thread on a message (NIP-29 kind 11 - thread root)
   */
  async createThreadRoot(
    groupId: string,
    parentMessageId: string,
    content: string,
    privkey: Uint8Array,
    attachments?: any[]
  ): Promise<Event> {
    const tags: string[][] = [
      ['h', groupId],
      ['e', parentMessageId, '', 'root'], // Reference to the original message
    ];
    
    // Add imeta tags for attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const imetaTag = [
          'imeta',
          `url ${attachment.url}`,
          `m ${attachment.mimeType}`,
          `size ${attachment.size}`,
        ];
        if (attachment.filename) {
          imetaTag.push(`name ${attachment.filename}`);
        }
        tags.push(imetaTag);
      }
    }
    
    const template: EventTemplate = {
      kind: 11,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Reply in a thread (NIP-22 kind 1111 - thread reply)
   */
  async replyInThread(
    groupId: string,
    rootEventId: string,
    parentEventId: string,
    content: string,
    privkey: Uint8Array,
    attachments?: any[]
  ): Promise<Event> {
    const tags: string[][] = [
      ['h', groupId],
      ['e', rootEventId, '', 'root'],
      ['e', parentEventId, '', 'reply'],
    ];
    
    // Add imeta tags for attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const imetaTag = [
          'imeta',
          `url ${attachment.url}`,
          `m ${attachment.mimeType}`,
          `size ${attachment.size}`,
        ];
        if (attachment.filename) {
          imetaTag.push(`name ${attachment.filename}`);
        }
        tags.push(imetaTag);
      }
    }
    
    const template: EventTemplate = {
      kind: 1111,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Get thread replies for a message
   */
  async getThreadReplies(rootEventId: string): Promise<Event[]> {
    const filter: any = {
      kinds: [11, 1111],
      '#e': [rootEventId],
    };
    
    const events = await this.queryEvents([filter]);
    
    // Sort by created_at ascending (oldest first)
    events.sort((a, b) => a.created_at - b.created_at);
    
    return events;
  }

  /**
   * Get thread counts for multiple messages
   */
  async getThreadCounts(messageIds: string[]): Promise<Record<string, number>> {
    if (messageIds.length === 0) {
      return {};
    }

    const filter: any = {
      kinds: [11, 1111],
      '#e': messageIds,
    };
    
    const events = await this.queryEvents([filter]);
    
    // Count replies per root message
    const counts: Record<string, number> = {};
    
    for (const event of events) {
      // Find the root 'e' tag
      const rootTag = event.tags.find(tag => tag[0] === 'e' && tag[3] === 'root');
      if (rootTag) {
        const rootId = rootTag[1];
        counts[rootId] = (counts[rootId] || 0) + 1;
      }
    }
    
    return counts;
  }

  /**
   * Add a reaction to a message (NIP-25 kind 7)
   */
  async addReaction(
    groupId: string,
    eventId: string,
    emoji: string,
    privkey: Uint8Array
  ): Promise<Event> {
    const template: EventTemplate = {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['h', groupId],
        ['e', eventId],
      ],
      content: emoji,
    };
    
    return this.publishEvent(template, privkey);
  }

  /**
   * Remove a reaction (publish deletion event for the reaction)
   */
  async removeReaction(
    reactionEventId: string,
    privkey: Uint8Array
  ): Promise<Event> {
    return this.deleteMessage(reactionEventId, privkey, 'Reaction removed');
  }

  /**
   * Get reactions for multiple messages
   */
  async getReactions(messageIds: string[]): Promise<Record<string, Record<string, string[]>>> {
    if (messageIds.length === 0) {
      return {};
    }

    const filter: any = {
      kinds: [7],
      '#e': messageIds,
    };
    
    const events = await this.queryEvents([filter]);
    
    // Group reactions by message ID, then by emoji, then collect user pubkeys
    const reactions: Record<string, Record<string, string[]>> = {};
    
    for (const event of events) {
      const eventTag = event.tags.find(tag => tag[0] === 'e');
      if (!eventTag) continue;
      
      const messageId = eventTag[1];
      const emoji = event.content;
      
      if (!reactions[messageId]) {
        reactions[messageId] = {};
      }
      if (!reactions[messageId][emoji]) {
        reactions[messageId][emoji] = [];
      }
      
      // Add the user's pubkey if not already present
      if (!reactions[messageId][emoji].includes(event.pubkey)) {
        reactions[messageId][emoji].push(event.pubkey);
      }
    }
    
    return reactions;
  }

  /**
   * Find user's existing reaction to a message
   */
  async findUserReaction(
    messageId: string,
    userPubkey: string,
    emoji: string
  ): Promise<Event | null> {
    const filter: any = {
      kinds: [7],
      '#e': [messageId],
      authors: [userPubkey],
    };
    
    const events = await this.queryEvents([filter]);
    
    // Find the reaction with matching emoji
    const reaction = events.find(e => e.content === emoji);
    return reaction || null;
  }
}
