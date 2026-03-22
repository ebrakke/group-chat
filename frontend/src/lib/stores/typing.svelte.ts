class TypingStore {
  // Map key: "channelId" or "channelId:parentId"
  // Map value: Map<userId, { displayName, timer }>
  private typers = $state(new Map<string, Map<number, { displayName: string; timer: ReturnType<typeof setTimeout> }>>());

  private makeKey(channelId: number, parentId: number | null): string {
    return parentId ? `${channelId}:${parentId}` : `${channelId}`;
  }

  addTyper(channelId: number, parentId: number | null, userId: number, displayName: string) {
    const key = this.makeKey(channelId, parentId);
    let contextMap = this.typers.get(key);
    if (!contextMap) {
      contextMap = new Map();
      this.typers.set(key, contextMap);
    }

    // Clear existing timer for this user
    const existing = contextMap.get(userId);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // Set new 3-second expiry timer
    const timer = setTimeout(() => {
      this.removeTyper(channelId, parentId, userId);
    }, 3000);

    contextMap.set(userId, { displayName, timer });
    // Trigger reactivity by reassigning the map
    this.typers = new Map(this.typers);
  }

  removeTyper(channelId: number, parentId: number | null, userId: number) {
    const key = this.makeKey(channelId, parentId);
    const contextMap = this.typers.get(key);
    if (!contextMap) return;

    const entry = contextMap.get(userId);
    if (entry) {
      clearTimeout(entry.timer);
      contextMap.delete(userId);
    }
    if (contextMap.size === 0) {
      this.typers.delete(key);
    }
    this.typers = new Map(this.typers);
  }

  getTypingText(channelId: number, parentId: number | null): string {
    const key = this.makeKey(channelId, parentId);
    const contextMap = this.typers.get(key);
    if (!contextMap || contextMap.size === 0) return '';

    const names = Array.from(contextMap.values()).map(v => v.displayName);
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return 'Several people are typing...';
  }

  clear(channelId: number, parentId: number | null) {
    const key = this.makeKey(channelId, parentId);
    const contextMap = this.typers.get(key);
    if (contextMap) {
      for (const entry of contextMap.values()) {
        clearTimeout(entry.timer);
      }
      this.typers.delete(key);
      this.typers = new Map(this.typers);
    }
  }
}

export const typingStore = new TypingStore();
