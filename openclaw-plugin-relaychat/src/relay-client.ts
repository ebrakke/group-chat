import WebSocket from 'ws';
import fetch from 'node-fetch';
import { AccountConfig, RelayMessage, WebSocketEvent, MessageHandler } from './types';

/**
 * RelayClient manages WebSocket connection and REST API calls to relay-chat.
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private config: AccountConfig;
  private messageHandler: MessageHandler | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 30000; // Cap at 30 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionallyClosed = false;

  constructor(config: AccountConfig) {
    this.config = config;
  }

  /**
   * Connect to relay-chat WebSocket with bot token authentication.
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.intentionallyClosed = false;
    const wsUrl = `${this.config.url}?token=${encodeURIComponent(this.config.token)}`;

    return new Promise((resolve, reject) => {
      // Set origin header to match the API base URL (required by relay-chat server)
      const origin = this.config.apiBase.replace('/api', '');
      this.ws = new WebSocket(wsUrl, {
        origin: origin,
      });

      this.ws.on('open', () => {
        console.log('[relay-client] WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          const event: WebSocketEvent = JSON.parse(rawMessage);
          this.handleWebSocketEvent(event, resolve);
        } catch (err) {
          console.error('[relay-client] Failed to parse WebSocket message:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[relay-client] WebSocket error:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log('[relay-client] WebSocket closed');
        this.ws = null;
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket events.
   */
  private handleWebSocketEvent(event: WebSocketEvent, connectResolve?: (value: void) => void): void {
    switch (event.type) {
      case 'connected':
        console.log('[relay-client] Authenticated successfully');
        if (connectResolve) {
          connectResolve();
        }
        break;

      case 'new_message':
      case 'new_reply':
        if (event.payload && this.messageHandler) {
          const message: RelayMessage = event.payload;
          this.messageHandler(message);
        }
        break;

      // Ignore other events for now
      default:
        break;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[relay-client] Max reconnection attempts reached, giving up');
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;

    console.log(`[relay-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[relay-client] Reconnection failed:', err);
      });
    }, delay);
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Disconnect from WebSocket and clean up.
   */
  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Post a reply to a message (creates a thread or continues existing thread).
   *
   * @param parentId - ID of the message to reply to
   * @param content - Text content of the reply
   * @returns Promise that resolves when reply is posted
   */
  async postReply(parentId: number, content: string): Promise<void> {
    const url = `${this.config.apiBase}/messages/${parentId}/reply`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to post reply: ${response.status} ${errorText}`);
    }

    console.log(`[relay-client] Posted reply to message ${parentId}`);
  }

  /**
   * Add a reaction emoji to a message.
   *
   * @param messageId - ID of the message to react to
   * @param emoji - Emoji to add (e.g., "👀", "👍")
   */
  async addReaction(messageId: number, emoji: string): Promise<void> {
    const url = `${this.config.apiBase}/v1/messages/${messageId}/reactions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ emoji }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add reaction: ${response.status} ${errorText}`);
    }

    console.log(`[relay-client] Added reaction ${emoji} to message ${messageId}`);
  }

  /**
   * Check if the relay-chat server is healthy.
   * Useful for verifying configuration before connecting.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const url = `${this.config.apiBase}/health`;
      const response = await fetch(url);
      return response.ok;
    } catch (err) {
      console.error('[relay-client] Health check failed:', err);
      return false;
    }
  }
}
