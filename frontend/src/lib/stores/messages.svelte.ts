import { api } from '$lib/api';
import type { Message } from '$lib/types';

class MessageStore {
  byChannel = $state<Record<number, Message[]>>({});

  getMessages(channelId: number): Message[] {
    return this.byChannel[channelId] ?? [];
  }

  async loadChannel(channelId: number) {
    const messages = await api<Message[]>('GET', `/api/channels/${channelId}/messages?limit=50`);
    // API returns newest-first (DESC); reverse so oldest is first, newest at bottom
    this.byChannel[channelId] = messages.reverse();
  }

  async send(channelId: number, content: string) {
    await api('POST', `/api/channels/${channelId}/messages`, { content });
  }

  addMessage(msg: Message) {
    const channelId = msg.channelId;
    const existing = this.byChannel[channelId] ?? [];
    // Deduplicate by id
    if (existing.some((m) => m.id === msg.id)) return;
    this.byChannel[channelId] = [...existing, msg];
  }

  updateReaction(messageId: number, emoji: string, userId: number, add: boolean) {
    for (const channelId of Object.keys(this.byChannel)) {
      const messages = this.byChannel[Number(channelId)];
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) continue;

      const msg = messages[idx];
      let reactions = msg.reactions ? [...msg.reactions] : [];

      const rIdx = reactions.findIndex((r) => r.emoji === emoji);
      if (add) {
        if (rIdx >= 0) {
          const r = reactions[rIdx];
          if (!r.userIds.includes(userId)) {
            reactions[rIdx] = { ...r, count: r.count + 1, userIds: [...r.userIds, userId] };
          }
        } else {
          reactions.push({ emoji, count: 1, userIds: [userId] });
        }
      } else {
        if (rIdx >= 0) {
          const r = reactions[rIdx];
          const newUserIds = r.userIds.filter((id) => id !== userId);
          if (newUserIds.length === 0) {
            reactions = reactions.filter((_, i) => i !== rIdx);
          } else {
            reactions[rIdx] = { ...r, count: newUserIds.length, userIds: newUserIds };
          }
        }
      }

      const updated = [...messages];
      updated[idx] = { ...msg, reactions };
      this.byChannel[Number(channelId)] = updated;
      break;
    }
  }

  incrementReplyCount(parentId: number) {
    for (const channelId of Object.keys(this.byChannel)) {
      const messages = this.byChannel[Number(channelId)];
      const idx = messages.findIndex((m) => m.id === parentId);
      if (idx === -1) continue;

      const updated = [...messages];
      updated[idx] = { ...updated[idx], replyCount: (updated[idx].replyCount || 0) + 1 };
      this.byChannel[Number(channelId)] = updated;
      break;
    }
  }
}

export const messageStore = new MessageStore();
