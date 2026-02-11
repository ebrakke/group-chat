import { WebSocket } from 'ws';
import { getUserByToken } from '../lib/users.js';
import { NostrClient } from '../nostr/client.js';
import { Event } from 'nostr-tools';
import { getDb } from '../db/schema.js';

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

    // Subscribe to all kind 9 events (messages) and kind 5 events (deletions)
    this.nostrClient.subscribe(
      this.subscriptionId,
      [
        { kinds: [9] }, // Messages
        { kinds: [5] }, // Deletions
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
    // Get the message ID being deleted from 'e' tag
    const eventTag = event.tags.find(tag => tag[0] === 'e');
    if (!eventTag) {
      return;
    }
    const deletedEventId = eventTag[1];

    // We need to query the original event to get the channel ID
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

    // Broadcast deletion to all connected clients
    const wsMessage: WebSocketMessage = {
      type: 'message.deleted',
      channelId,
      messageId: deletedEventId,
    };

    this.broadcast(wsMessage);
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
   * Close all connections
   */
  closeAll(): void {
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();
  }
}
