import { getWsUrl } from './utils/platform';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';
import { calendarStore } from './stores/calendar.svelte';
import { threadStore } from './stores/threads';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  connected = $state(false);

  connect() {
    const url = getWsUrl();

    try {
      this.ws = new WebSocket(url);
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
    const payload = data.payload;
    switch (data.type) {
      case 'new_message':
        if (payload) {
          messageStore.addMessage(payload);
          if (payload.channelId !== channelStore.activeChannelId) {
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
