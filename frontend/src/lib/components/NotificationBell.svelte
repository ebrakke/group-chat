<script lang="ts">
  import { api } from '$lib/api';
  import BellRing from 'lucide-svelte/icons/bell-ring';
  import AtSign from 'lucide-svelte/icons/at-sign';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import BellOff from 'lucide-svelte/icons/bell-off';

  type Level = 'everything' | 'mentions' | 'threads' | 'nothing';
  const CYCLE: Level[] = ['mentions', 'everything', 'threads', 'nothing'];
  const LABELS: Record<Level, string> = {
    everything: 'All messages',
    mentions: 'Mentions only',
    threads: 'Thread replies',
    nothing: 'Muted',
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
    <BellRing size={16} />
  {:else if level === 'mentions'}
    <AtSign size={16} />
  {:else if level === 'threads'}
    <MessageSquare size={16} />
  {:else}
    <BellOff size={16} />
  {/if}
</button>
