import { ChatWebSocket } from '$lib/websocket';
import type { WebSocketEventType, WebSocketEventHandler } from '$lib/websocket';

class WebSocketStore {
  private ws: ChatWebSocket | null = $state(null);
  private handlers = new Map<string, Set<WebSocketEventHandler>>();
  
  get isConnected() {
    return this.ws !== null && this.ws.isConnected();
  }
  
  connect(token: string) {
    if (this.ws) {
      console.warn('WebSocket already connected');
      return;
    }
    
    this.ws = new ChatWebSocket(token);
    this.ws.connect();
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
    }
    this.handlers.clear();
  }
  
  on(event: WebSocketEventType, handler: WebSocketEventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // Also register with the underlying WebSocket
    if (this.ws) {
      this.ws.on(event, handler);
    }
  }
  
  off(event: WebSocketEventType, handler: WebSocketEventHandler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    
    // Also unregister from the underlying WebSocket
    if (this.ws) {
      this.ws.off(event, handler);
    }
  }
  
  send(message: any) {
    if (this.ws) {
      this.ws.send(message);
    }
  }
}

export const websocket = new WebSocketStore();
