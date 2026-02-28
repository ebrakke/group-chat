import { api } from '$lib/api';
import type { Message, ThreadSummary } from '$lib/types';

class ThreadStore {
  openThreadId = $state<number | null>(null);
  parentMessage = $state<Message | null>(null);
  replies = $state<Message[]>([]);
  muted = $state(false);
  myThreads = $state<ThreadSummary[]>([]);

  async openThread(parentId: number, parentMsg?: Message) {
    this.openThreadId = parentId;
    if (parentMsg) this.parentMessage = parentMsg;
    await this.loadReplies(parentId);
    await this.checkMuted(parentId);
  }

  closeThread() {
    this.openThreadId = null;
    this.parentMessage = null;
    this.replies = [];
  }

  async loadReplies(parentId: number) {
    this.replies = await api<Message[]>('GET', `/api/messages/${parentId}/thread?limit=50`);
  }

  async sendReply(parentId: number, content: string) {
    await api('POST', `/api/messages/${parentId}/reply`, { content });
  }

  addReply(reply: Message) {
    if (reply.parentId === this.openThreadId) {
      if (!this.replies.find((r) => r.id === reply.id)) {
        this.replies = [...this.replies, reply];
      }
    }
  }

  updateReply(updated: Message) {
    if (!this.replies) return;
    const idx = this.replies.findIndex((r) => r.id === updated.id);
    if (idx === -1) return;
    this.replies = [...this.replies];
    this.replies[idx] = { ...this.replies[idx], ...updated };
  }

  removeReply(messageId: number) {
    if (!this.replies) return;
    this.replies = this.replies.filter((r) => r.id !== messageId);
  }

  async checkMuted(parentId: number) {
    try {
      const res = await api<{ muted: boolean }>('GET', `/api/threads/${parentId}/mute`);
      this.muted = res.muted;
    } catch {
      this.muted = false;
    }
  }

  async toggleMute() {
    if (!this.openThreadId) return;
    try {
      if (this.muted) {
        await api('DELETE', `/api/threads/${this.openThreadId}/mute`);
      } else {
        await api('POST', `/api/threads/${this.openThreadId}/mute`);
      }
      this.muted = !this.muted;
    } catch {
      // ignore mute toggle errors
    }
  }

  async loadMyThreads() {
    this.myThreads = await api<ThreadSummary[]>('GET', '/api/me/threads?limit=30');
  }
}

export const threadStore = new ThreadStore();
