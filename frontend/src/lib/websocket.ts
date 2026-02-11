import type { Message } from './api';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

// In production, derive WebSocket URL from window.location
// In dev/SSR, use environment variable
function getWebSocketUrl(): string {
  if (browser && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }
  return env.PUBLIC_WS_URL || import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';
}

const WS_URL = getWebSocketUrl();

export type WebSocketEventType = 
  | 'message.new' 
  | 'message.updated' 
  | 'message.deleted' 
  | 'thread.new'
  | 'reaction.added'
  | 'reaction.removed'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'authenticated' 
  | 'error';

export interface WebSocketEvent {
  type: WebSocketEventType;
  channelId?: string;
  message?: Message;
  messageId?: string;
  parentId?: string;
  emoji?: string;
  userId?: string;
  [key: string]: any;
}

export type WebSocketEventHandler = (event: WebSocketEvent) => void;

export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<WebSocketEventType, Set<WebSocketEventHandler>> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private token: string | null = null;

  constructor(token?: string) {
    if (token) {
      this.token = token;
    }
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    const url = this.token ? `${WS_URL}?token=${encodeURIComponent(this.token)}` : WS_URL;
    
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        
        // If no token in URL, send auth message
        if (!this.token || !url.includes('token=')) {
          if (this.token) {
            this.send({ type: 'auth', token: this.token });
          }
        }
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          this.handleEvent(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleEvent(event: WebSocketEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (err) {
          console.error('Error in WebSocket event handler:', err);
        }
      });
    }
  }

  on(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  off(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: WebSocket not connected');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
