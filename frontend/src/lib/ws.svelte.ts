import { getWsUrl, isNative } from './utils/platform';
import { getSessionToken } from './api';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';
import { threadStore } from './stores/threads';
import { authStore } from './stores/auth.svelte';
import { showNativeNotification } from './utils/native';

function showBrowserNotification(title: string, body: string) {
  if (isNative()) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore notification errors (e.g. in non-secure contexts)
  }
}

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
    const payload = data.payload;
    switch (data.type) {
      case 'new_message':
        if (payload) {
          messageStore.addMessage(payload);
          // Update unread for non-active channels
          if (payload.channelId !== channelStore.activeChannelId) {
            channelStore.updateUnread(payload.channelId, 1, false);
          }
          // Browser notification when tab is hidden or message is in another channel (skip own messages)
          if (payload.userId !== authStore.user?.id && (document.hidden || payload.channelId !== channelStore.activeChannelId)) {
            const ch = channelStore.channels.find((c) => c.id === payload.channelId);
            const channelName = ch ? `#${ch.name}` : 'New message';
            const preview = payload.content?.substring(0, 100) || '';
            showBrowserNotification(channelName, `${payload.displayName}: ${preview}`);
            showNativeNotification(channelName, `${payload.displayName}: ${preview}`, {
              channelId: payload.channelId,
              channelName: ch?.name,
            });
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
          // Browser notification when reply is in a different thread than the open one (skip own replies)
          if (payload.userId !== authStore.user?.id && payload.parentId !== threadStore.openThreadId) {
            const preview = payload.content?.substring(0, 100) || '';
            showBrowserNotification('Thread reply', `${payload.displayName}: ${preview}`);
            showNativeNotification('Thread reply', `${payload.displayName}: ${preview}`, {
              channelId: payload.channelId,
              threadId: payload.parentId,
              channelName: channelStore.getNameById(payload.channelId),
            });
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
