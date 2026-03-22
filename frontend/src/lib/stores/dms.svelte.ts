import { api } from '$lib/api';
import type { DMConversation } from '$lib/types';

class DMStore {
  conversations = $state<DMConversation[]>([]);
  activeConversationId = $state<number | null>(null);

  get activeConversation(): DMConversation | undefined {
    return this.conversations.find((c) => c.id === this.activeConversationId);
  }

  async load() {
    this.conversations = await api<DMConversation[]>('GET', '/api/dms');
  }

  setActive(id: number | null) {
    this.activeConversationId = id;
  }

  async startDM(userId: number): Promise<DMConversation> {
    const conv = await api<DMConversation>('POST', '/api/dms', { userId });
    await this.load();
    const enriched = this.conversations.find((c) => c.id === conv.id);
    return enriched ?? conv;
  }

  getByChannelId(channelId: number): DMConversation | undefined {
    return this.conversations.find((c) => c.channelId === channelId);
  }

  addConversation(conv: DMConversation) {
    if (!this.conversations.find((c) => c.id === conv.id)) {
      this.conversations = [conv, ...this.conversations];
    }
  }

  updateUnread(channelId: number, increment: number) {
    this.conversations = this.conversations.map((c) => {
      if (c.channelId !== channelId) return c;
      return { ...c, unreadCount: (c.unreadCount || 0) + increment };
    });
  }

  updateLastMessage(channelId: number, content: string, senderName: string, timestamp: string) {
    this.conversations = this.conversations.map((c) => {
      if (c.channelId !== channelId) return c;
      return {
        ...c,
        lastMessageContent: content.length > 100 ? content.slice(0, 100) + '...' : content,
        lastMessageAt: timestamp,
        lastMessageSenderName: senderName
      };
    });
    this.conversations = [...this.conversations].sort((a, b) => {
      const aTime = a.lastMessageAt || a.createdAt;
      const bTime = b.lastMessageAt || b.createdAt;
      return bTime.localeCompare(aTime);
    });
  }

  markRead(channelId: number) {
    this.conversations = this.conversations.map((c) =>
      c.channelId === channelId ? { ...c, unreadCount: 0 } : c
    );
  }

  get totalUnread(): number {
    return this.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }
}

export const dmStore = new DMStore();
