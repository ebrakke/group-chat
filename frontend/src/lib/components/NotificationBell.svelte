<script lang="ts">
  import { api } from '$lib/api';

  type Level = 'everything' | 'mentions' | 'threads' | 'nothing';
  const CYCLE: Level[] = ['mentions', 'everything', 'threads', 'nothing'];
  const LABELS: Record<Level, string> = {
    everything: 'all messages',
    mentions: 'mentions',
    threads: 'threads',
    nothing: 'muted',
  };

  let { channelId }: { channelId: number } = $props();
  let level = $state<Level>('mentions');
  let loading = $state(false);
  let lastLoadedChannelId = $state(0);

  $effect(() => {
    if (channelId && channelId !== lastLoadedChannelId) {
      lastLoadedChannelId = channelId;
      loadLevel(channelId);
    }
  });

  async function loadLevel(id: number) {
    try {
      const res = await api<{ level: Level }>('GET', `/api/channels/${id}/notifications`);
      level = res.level;
    } catch {
      level = 'mentions';
    }
  }

  async function cycle() {
    if (loading) return;
    const idx = CYCLE.indexOf(level);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    const prev = level;
    level = next; // optimistic
    loading = true;
    try {
      await api('PUT', `/api/channels/${channelId}/notifications`, { level: next });
    } catch {
      level = prev; // revert
    } finally {
      loading = false;
    }
  }
</script>

<button
  onclick={cycle}
  class="p-1 hover:opacity-70 transition-opacity"
  style="color: var(--rc-timestamp);"
  title="Notifications: {LABELS[level]}"
  aria-label="Notification level: {LABELS[level]}"
>
  {#if level === 'everything'}
    <!-- Bell ringing -->
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M6 15h2l2 4h4l2-4h2a1 1 0 001-1v-4a7 7 0 00-14 0v4a1 1 0 001 1z" />
    </svg>
  {:else if level === 'mentions'}
    <!-- Bell normal (default) -->
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  {:else if level === 'threads'}
    <!-- Chat bubble -->
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  {:else}
    <!-- Bell off / muted -->
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      <line x1="3" y1="3" x2="21" y2="21" stroke-linecap="round" />
    </svg>
  {/if}
</button>
