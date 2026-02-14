/**
 * Global service instances
 * These are initialized externally and accessed by API routes
 */

import type { NostrClient } from './nostr/client.js';
import type { WebSocketHandler } from './websocket/handler.js';

// Use globalThis to share state across modules
declare global {
  var __nostrClient: NostrClient | undefined;
  var __wsHandler: WebSocketHandler | undefined;
}

export function setNostrClient(client: NostrClient): void {
  globalThis.__nostrClient = client;
}

export function getNostrClient(): NostrClient | undefined {
  return globalThis.__nostrClient;
}

export function setWebSocketHandler(handler: WebSocketHandler): void {
  globalThis.__wsHandler = handler;
}

export function getWebSocketHandler(): WebSocketHandler | undefined {
  return globalThis.__wsHandler;
}
