import { getWsUrl } from './utils/platform';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';
import { calendarStore } from './stores/calendar.svelte';
import { threadStore } from './stores/threads';
import { dmStore } from './stores/dms.svelte';
import { typingStore } from './stores/typing.svelte';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private visibilityHandler: (() => void) | null = null;
  connected = $state(false);
  displayConnected = $state(false);

  connect() {
    // Clean up any existing connection first
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    const url = getWsUrl();

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      // Clear any pending debounce and immediately show as connected
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.displayConnected = true;
      this.reconnectAttempt = 0;
      this.lastPong = Date.now();
      this.startHeartbeat();
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.stopHeartbeat();
      // Debounce the display state — wait 5s before showing disconnected
      if (!this.debounceTimer) {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          if (!this.connected) {
            this.displayConnected = false;
          }
        }, 5000);
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          this.lastPong = Date.now();
          return;
        }
        this.handleEvent(data);
      } catch (err) {
        console.warn('[ws] Failed to handle message:', err);
      }
    };

    // Set up visibility change listener (once)
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Send a ping every 30s; if no pong received within 45s, reconnect
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Check if we missed a pong (stale connection)
      if (Date.now() - this.lastPong > 45000) {
        console.warn('[ws] Heartbeat timeout — reconnecting');
        this.ws.close();
        return;
      }

      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Send failed — connection is dead
        this.ws?.close();
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleVisibilityChange() {
    if (document.hidden) return;

    // Tab/PWA became visible — check if WS is still alive
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.info('[ws] Reconnecting after visibility change');
      this.reconnectAttempt = 0; // Reset backoff for immediate reconnect
      this.connect();
      return;
    }

    // Connection looks open but might be stale — send a ping to verify
    try {
      this.lastPong = Date.now(); // Give it a fresh window
      this.ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      this.ws?.close();
    }
  }

  private handleEvent(data: any) {
    const payload = data.payload;
    switch (data.type) {
      case 'new_message':
        if (payload) {
          messageStore.addMessage(payload);
          typingStore.removeTyper(payload.channelId, null, payload.userId);
          const dmConv = dmStore.getByChannelId(payload.channelId);
          if (dmConv) {
            dmStore.updateLastMessage(
              payload.channelId,
              payload.content,
              payload.displayName,
              payload.createdAt
            );
            if (dmStore.activeConversationId !== dmConv.id) {
              dmStore.updateUnread(payload.channelId, 1);
            }
          } else if (payload.channelId !== channelStore.activeChannelId) {
            channelStore.updateUnread(payload.channelId, 1, false);
          }
        }
        break;
      case 'new_reply':
        if (payload) {
          messageStore.incrementReplyCount(payload.parentId);
          messageStore.addReplyParticipant(payload.parentId, {
            userId: payload.userId,
            username: payload.username,
            displayName: payload.displayName,
            avatarUrl: payload.avatarUrl
          });
          threadStore.addReply(payload);
          typingStore.removeTyper(payload.channelId, payload.parentId, payload.userId);
          const dmConvReply = dmStore.getByChannelId(payload.channelId);
          if (dmConvReply && dmStore.activeConversationId !== dmConvReply.id) {
            dmStore.updateUnread(payload.channelId, 1);
          }
        }
        break;
      case 'reaction_added':
        if (payload) {
          messageStore.updateReaction(payload.messageId, payload.emoji, payload.userId, true, payload.displayName);
        }
        break;
      case 'reaction_removed':
        if (payload) {
          messageStore.updateReaction(payload.messageId, payload.emoji, payload.userId, false);
        }
        break;
      case 'message_edited':
        if (payload) {
          messageStore.updateMessage(payload);
          threadStore.updateReply(payload);
        }
        break;
      case 'message_deleted':
        if (payload) {
          messageStore.removeMessage(payload.messageId);
          threadStore.removeReply(payload.messageId);
        }
        break;
      case 'channel_created':
        if (payload) {
          channelStore.addChannel({ id: payload.id, name: payload.name });
        }
        break;
      case 'dm_created':
        if (payload) {
          dmStore.load();
        }
        break;
      case 'user_typing':
        if (payload) {
          typingStore.addTyper(payload.channelId, payload.parentId, payload.userId, payload.displayName);
        }
        break;
      case 'calendar_event_created':
        if (payload) calendarStore.addEvent(payload);
        break;
      case 'calendar_event_updated':
        if (payload) calendarStore.updateEvent(payload);
        break;
      case 'calendar_event_deleted':
        if (payload) calendarStore.removeEvent(payload.id);
        break;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  private typingThrottles = new Map<string, number>();

  sendTyping(channelId: number, parentId: number | null = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const key = parentId ? `${channelId}:${parentId}` : `${channelId}`;
    const now = Date.now();
    const last = this.typingThrottles.get(key) ?? 0;
    if (now - last < 2000) return;
    this.typingThrottles.set(key, now);

    try {
      this.ws.send(JSON.stringify({ type: 'typing', channelId, parentId }));
    } catch {
      // Silently ignore — typing is non-critical
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.displayConnected = false;
  }
}

export const wsManager = new WebSocketManager();
