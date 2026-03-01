import { api } from '$lib/api';
import type { Channel } from '$lib/types';

class ChannelStore {
  channels = $state<Channel[]>([]);
  activeChannelId = $state<number | null>(null);

  get activeChannel(): Channel | undefined {
    return this.channels.find((c) => c.id === this.activeChannelId);
  }

  async load() {
    this.channels = await api<Channel[]>('GET', '/api/channels');
  }

  setActive(id: number) {
    this.activeChannelId = id;
  }

  async create(name: string): Promise<Channel> {
    const channel = await api<Channel>('POST', '/api/channels', { name });
    this.channels = [...this.channels, channel];
    return channel;
  }

  async markRead(channelId: number, messageId: number) {
    await api('POST', `/api/channels/${channelId}/read`, { messageId });
    this.channels = this.channels.map((c) =>
      c.id === channelId ? { ...c, unreadCount: 0, hasMention: false } : c
    );
  }

  updateUnread(channelId: number, increment: number, hasMention?: boolean) {
    this.channels = this.channels.map((c) => {
      if (c.id !== channelId) return c;
      return {
        ...c,
        unreadCount: (c.unreadCount || 0) + increment,
        hasMention: hasMention || c.hasMention
      };
    });
  }

  addChannel(channel: Channel) {
    if (!this.channels.find((c) => c.id === channel.id)) {
      this.channels = [...this.channels, channel];
    }
  }

  getByName(name: string): Channel | undefined {
    return this.channels.find((c) => c.name === name);
  }

  getNameById(id: number): string | undefined {
    return this.channels.find((c) => c.id === id)?.name;
  }
}

export const channelStore = new ChannelStore();
