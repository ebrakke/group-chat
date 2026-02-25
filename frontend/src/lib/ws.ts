import { getWsUrl, isNative } from './utils/platform';
import { getSessionToken } from './api';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  connected = $state(false);

  connect() {
    const url = getWsUrl();
    const token = getSessionToken();
    let wsUrl = url;
    if (isNative() && token) {
      wsUrl += `?token=${token}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempt = 0;
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private handleEvent(data: any) {
    switch (data.type) {
      case 'new_message':
        messageStore.addMessage(data);
        // Update unread for non-active channels
        if (data.channelId !== channelStore.activeChannelId) {
          channelStore.updateUnread(data.channelId, 1, false);
        }
        break;
      case 'new_reply':
        messageStore.incrementReplyCount(data.parentId);
        break;
      case 'reaction_added':
        messageStore.updateReaction(data.messageId, data.emoji, data.userId, true);
        break;
      case 'reaction_removed':
        messageStore.updateReaction(data.messageId, data.emoji, data.userId, false);
        break;
      case 'channel_created':
        channelStore.addChannel({ id: data.id, name: data.name });
        break;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export const wsManager = new WebSocketManager();
