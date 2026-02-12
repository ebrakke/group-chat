/**
 * Shared constants for Relay Chat
 */

// UI behavior constants
export const SCROLL_THRESHOLD = 100; // pixels from bottom to trigger auto-scroll
export const OPTIMISTIC_MATCH_THRESHOLD = 5000; // ms for matching optimistic messages to real ones

// WebSocket reconnection configuration
export const WEBSOCKET_RECONNECT_ATTEMPTS = 5;
export const WEBSOCKET_BASE_DELAY = 1000; // ms
export const WEBSOCKET_MAX_DELAY = 30000; // ms

// Mobile breakpoint (matches Tailwind's md breakpoint)
export const MOBILE_BREAKPOINT = 768; // px
