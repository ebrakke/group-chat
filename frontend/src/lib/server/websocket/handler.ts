import { WebSocket } from 'ws';
import { getUserByToken } from '$lib/server/lib/users.js';
import { NostrClient } from '$lib/server/nostr/client.js';
import { Event } from 'nostr-tools';
import { getDb } from '$lib/server/db/schema.js';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAuthenticated?: boolean;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export class WebSocketHandler {
  private clients: Set<AuthenticatedWebSocket> = new Set();
  private nostrClient: NostrClient;
  private subscriptionId: string = 'ws-messages';

  constructor(nostrClient: NostrClient) {
    this.nostrClient = nostrClient;
    this.initializeNostrSubscription();
  }

  /**
   * Initialize persistent Nostr subscription for all groups
   */
  private initializeNostrSubscription(): void {
    if (!this.nostrClient.isConnected()) {
      console.warn('Nostr client not connected, cannot initialize WebSocket subscriptions');
      return;
    }

    // Subscribe to all relevant event types:
    // - kind 9 (messages)
    // - kind 5 (deletions)
    // - kind 11 (thread roots)
    // - kind 1111 (thread replies)
    // - kind 7 (reactions)
    this.nostrClient.subscribe(
      this.subscriptionId,
      [
        { kinds: [9] },    // Messages
        { kinds: [5] },    // Deletions
        { kinds: [11] },   // Thread roots
        { kinds: [1111] }, // Thread replies
        { kinds: [7] },    // Reactions
      ],
      this.handleNostrEvent.bind(this)
    );

    console.log('WebSocket: Initialized Nostr subscriptions');
  }

  /**
   * Handle incoming Nostr events and broadcast to WebSocket clients
   */
  private async handleNostrEvent(event: Event): Promise<void> {
    try {
      if (event.kind === 9) {
        // Message event
        await this.handleMessageEvent(event);
      } else if (event.kind === 5) {
        // Deletion event
        await this.handleDeletionEvent(event);
      } else if (event.kind === 11 || event.kind === 1111) {
        // Thread events (root or reply)
        await this.handleThreadEvent(event);
      } else if (event.kind === 7) {
        // Reaction event
        await this.handleReactionEvent(event);
      }
    } catch (err) {
      console.error('Error handling Nostr event in WebSocket:', err);
    }
  }

  /**
   * Handle message event (kind 9)
   */
  private async handleMessageEvent(event: Event): Promise<void> {
    // Get channel ID from 'h' tag
    const channelTag = event.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return; // Not a valid channel message
    }
    const channelId = channelTag[1];

    // Get author info from database
    const db = getDb();
    const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
      .get(event.pubkey) as any;

    if (!author) {
      console.warn('Message from unknown user:', event.pubkey);
      return;
    }

    // Parse attachments from imeta tags
    const attachments = event.tags
      .filter(tag => tag[0] === 'imeta')
      .map(tag => {
        const attachment: any = {};
        for (let i = 1; i < tag.length; i++) {
          const [key, value] = tag[i].split(' ', 2);
          if (key === 'url') attachment.url = value;
          if (key === 'm') attachment.mimeType = value;
          if (key === 'size') attachment.size = parseInt(value);
          if (key === 'name') attachment.filename = value;
        }
        return attachment;
      });

    // Check if this is an edit (has 'e' tag)
    const editTag = event.tags.find(tag => tag[0] === 'e');
    const isEdit = !!editTag;

    // For edits, we need to query the original event to get its creation timestamp
    let originalCreatedAt = event.created_at;
    if (isEdit && editTag) {
      const originalEvents = await this.nostrClient.queryEvents([{ ids: [editTag[1]] }]);
      if (originalEvents.length > 0) {
        originalCreatedAt = originalEvents[0].created_at;
      }
    }

    const message = {
      id: isEdit && editTag ? editTag[1] : event.id, // Use original message ID for edits
      channelId,
      author: {
        id: author.id as string,
        username: author.username as string,
        displayName: author.display_name as string,
        nostrPubkey: author.nostr_pubkey as string,
      },
      content: event.content,
      attachments,
      reactions: {},
      threadCount: 0,
      createdAt: new Date(originalCreatedAt * 1000).toISOString(),
      editedAt: isEdit ? new Date(event.created_at * 1000).toISOString() : null,
    };

    // Broadcast to all connected clients
    const wsMessage: WebSocketMessage = {
      type: isEdit ? 'message.updated' : 'message.new',
      channelId,
      message,
    };

    this.broadcast(wsMessage);
  }

  /**
   * Handle deletion event (kind 5)
   */
  private async handleDeletionEvent(event: Event): Promise<void> {
    // Get the event ID being deleted from 'e' tag
    const eventTag = event.tags.find(tag => tag[0] === 'e');
    if (!eventTag) {
      return;
    }
    const deletedEventId = eventTag[1];

    // We need to query the original event to get the channel ID and kind
    const originalEvents = await this.nostrClient.queryEvents([{ ids: [deletedEventId] }]);
    if (originalEvents.length === 0) {
      console.warn('Cannot find original event for deletion:', deletedEventId);
      return;
    }

    const originalEvent = originalEvents[0];
    const channelTag = originalEvent.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return;
    }
    const channelId = channelTag[1];

    // Check if this is a reaction deletion (kind 7)
    if (originalEvent.kind === 7) {
      // Get the message ID from the reaction's 'e' tag
      const reactionEventTag = originalEvent.tags.find(tag => tag[0] === 'e');
      if (!reactionEventTag) {
        return;
      }
      const messageId = reactionEventTag[1];
      const emoji = originalEvent.content;

      // Get user ID from database
      const db = getDb();
      const user = db.prepare('SELECT id FROM users WHERE nostr_pubkey = ?')
        .get(originalEvent.pubkey) as any;

      if (!user) {
        console.warn('Reaction deletion from unknown user:', originalEvent.pubkey);
        return;
      }

      // Broadcast reaction removal
      const wsMessage: WebSocketMessage = {
        type: 'reaction.removed',
        channelId,
        messageId,
        emoji,
        userId: user.id,
      };

      this.broadcast(wsMessage);
    } else {
      // Regular message deletion
      const wsMessage: WebSocketMessage = {
        type: 'message.deleted',
        channelId,
        messageId: deletedEventId,
      };

      this.broadcast(wsMessage);
    }
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws: AuthenticatedWebSocket, request: any): void {
    console.log('New WebSocket connection');

    // Try to authenticate from query params or wait for auth message
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (token) {
      this.authenticateClient(ws, token);
    }

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleClientMessage(ws, message);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log('WebSocket client disconnected:', ws.userId || 'unauthenticated');
      this.clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      this.clients.delete(ws);
    });

    this.clients.add(ws);
  }

  /**
   * Handle messages from client
   */
  private handleClientMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (message.type === 'auth') {
      // Authenticate client
      const token = message.token;
      if (token) {
        this.authenticateClient(ws, token);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing auth token' }));
      }
    } else if (message.type === 'ping') {
      // Respond to ping
      ws.send(JSON.stringify({ type: 'pong' }));
    } else {
      // Unknown message type
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  /**
   * Authenticate a WebSocket client
   */
  private authenticateClient(ws: AuthenticatedWebSocket, token: string): void {
    const user = getUserByToken(token);
    if (user) {
      ws.userId = user.id;
      ws.username = user.username;
      ws.isAuthenticated = true;
      ws.send(JSON.stringify({ type: 'authenticated', user: { id: user.id, username: user.username, displayName: user.displayName } }));
      console.log('WebSocket client authenticated:', user.username);
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
      ws.close();
    }
  }

  /**
   * Broadcast message to all authenticated clients
   */
  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.isAuthenticated && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sentCount++;
      }
    });

    console.log(`Broadcast message to ${sentCount} clients:`, message.type);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast a new message to WebSocket clients (called when message is published)
   */
  broadcastNewMessage(channelId: string, message: any): void {
    const wsMessage: WebSocketMessage = {
      type: 'message.new',
      channelId,
      message,
    };
    this.broadcast(wsMessage);
  }

  /**
   * Broadcast a new thread reply to WebSocket clients (called when reply is published)
   */
  broadcastThreadReply(channelId: string, parentId: string, message: any): void {
    const wsMessage: WebSocketMessage = {
      type: 'thread.new',
      channelId,
      parentId,
      message,
    };
    this.broadcast(wsMessage);
  }

  /**
   * Broadcast channel created event
   */
  broadcastChannelCreated(channel: any): void {
    const wsMessage: WebSocketMessage = {
      type: 'channel.created',
      channel,
    };
    this.broadcast(wsMessage);
  }

  /**
   * Broadcast channel updated event
   */
  broadcastChannelUpdated(channel: any): void {
    const wsMessage: WebSocketMessage = {
      type: 'channel.updated',
      channel,
    };
    this.broadcast(wsMessage);
  }

  /**
   * Broadcast channel deleted event
   */
  broadcastChannelDeleted(channelId: string): void {
    const wsMessage: WebSocketMessage = {
      type: 'channel.deleted',
      channelId,
    };
    this.broadcast(wsMessage);
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();
  }

  /**
   * Handle thread event (kind 11 or 1111)
   */
  private async handleThreadEvent(event: Event): Promise<void> {
    // Get channel ID from 'h' tag
    const channelTag = event.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return; // Not a valid channel message
    }
    const channelId = channelTag[1];

    // Get the parent message ID from 'e' tag with 'root' marker
    const rootTag = event.tags.find(tag => tag[0] === 'e' && tag[3] === 'root');
    if (!rootTag) {
      return; // Not a valid thread event
    }
    const parentId = rootTag[1];

    // Get author info from database
    const db = getDb();
    const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
      .get(event.pubkey) as any;

    if (!author) {
      console.warn('Thread message from unknown user:', event.pubkey);
      return;
    }

    // Parse attachments from imeta tags
    const attachments = event.tags
      .filter(tag => tag[0] === 'imeta')
      .map(tag => {
        const attachment: any = {};
        for (let i = 1; i < tag.length; i++) {
          const [key, value] = tag[i].split(' ', 2);
          if (key === 'url') attachment.url = value;
          if (key === 'm') attachment.mimeType = value;
          if (key === 'size') attachment.size = parseInt(value);
          if (key === 'name') attachment.filename = value;
        }
        return attachment;
      });

    const message = {
      id: event.id,
      channelId,
      author: {
        id: author.id as string,
        username: author.username as string,
        displayName: author.display_name as string,
        nostrPubkey: author.nostr_pubkey as string,
      },
      content: event.content,
      attachments,
      reactions: {},
      threadCount: 0,
      createdAt: new Date(event.created_at * 1000).toISOString(),
      editedAt: null,
    };

    // Broadcast to all connected clients
    const wsMessage: WebSocketMessage = {
      type: 'thread.new',
      channelId,
      parentId,
      message,
    };

    this.broadcast(wsMessage);
  }

  /**
   * Handle reaction event (kind 7)
   */
  private async handleReactionEvent(event: Event): Promise<void> {
    // Get channel ID from 'h' tag
    const channelTag = event.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return; // Not a valid reaction
    }
    const channelId = channelTag[1];

    // Get the message ID from 'e' tag
    const eventTag = event.tags.find(tag => tag[0] === 'e');
    if (!eventTag) {
      return;
    }
    const messageId = eventTag[1];
    const emoji = event.content;

    // Get user ID from database
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE nostr_pubkey = ?')
      .get(event.pubkey) as any;

    if (!user) {
      console.warn('Reaction from unknown user:', event.pubkey);
      return;
    }

    // Check if this is a reaction or a reaction deletion
    // We need to query if there's a kind 5 (deletion) event for this reaction
    // For simplicity, we'll always broadcast as added and let the deletion handler remove it
    const wsMessage: WebSocketMessage = {
      type: 'reaction.added',
      channelId,
      messageId,
      emoji,
      userId: user.id,
    };

    this.broadcast(wsMessage);
  }
}
