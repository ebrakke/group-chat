<script lang="ts">
  import type { Message as MessageType } from '$lib/types';
  import Message from './Message.svelte';
  import { tick } from 'svelte';

  let {
    messages,
    onOpenThread,
    onOpenProfile,
    compact = false
  }: {
    messages: MessageType[];
    onOpenThread?: (id: number) => void;
    onOpenProfile?: (profile: { displayName: string; username?: string; avatarUrl?: string; role?: string; userCreatedAt?: string; isBot?: boolean; userId?: number }) => void;
    compact?: boolean;
  } = $props();

  let container: HTMLDivElement | undefined = $state();
  let isAtBottom = $state(true);
  let resizeObserver: ResizeObserver | undefined;

  const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  function isSameDay(a: string, b: string): boolean {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate();
  }

  function formatDateSeparator(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(ts, now.toISOString())) return 'Today';
    if (isSameDay(ts, yesterday.toISOString())) return 'Yesterday';

    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function isGrouped(msg: MessageType, prev: MessageType | undefined): boolean {
    if (!prev) return false;
    if (prev.userId !== msg.userId) return false;
    const gap = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return gap < GROUP_WINDOW_MS;
  }

  function showDateSeparator(msg: MessageType, prev: MessageType | undefined): boolean {
    if (!prev) return true; // always show for first message
    return !isSameDay(msg.createdAt, prev.createdAt);
  }

  function scrollToBottom() {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // Re-scroll when content resizes (e.g. images loading)
  $effect(() => {
    if (!container) return;

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (isAtBottom) scrollToBottom();
    });

    // Observe the scroll content so image loads trigger re-scroll
    for (const child of container.children) {
      resizeObserver.observe(child);
    }

    return () => resizeObserver?.disconnect();
  });

  // Track whether user is scrolled to bottom
  function handleScroll() {
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
  }

  $effect(() => {
    // Scroll to bottom when new messages arrive (if already at bottom)
    if (messages.length) {
      tick().then(() => {
        if (isAtBottom) scrollToBottom();
      });
    }
  });
</script>

<div id="messages" bind:this={container} class="message-list flex-1 overflow-y-auto py-2" onscroll={handleScroll}>
  {#each messages as msg, i (msg.id)}
    {@const prev = messages[i - 1]}
    {@const showDate = showDateSeparator(msg, prev)}
    {@const grouped = !showDate && isGrouped(msg, prev)}

    {#if showDate}
      <div class="flex items-center gap-2 px-4" style="margin-top: {compact ? '8px' : '12px'}; margin-bottom: {compact ? '8px' : '12px'}">
        <div class="flex-1 border-t" style="border-color: var(--border);"></div>
        <span
          class="text-[10px] uppercase tracking-[0.1em] shrink-0 select-none"
          style="color: var(--rc-divider-label);"
        >{formatDateSeparator(msg.createdAt)}</span>
        <div class="flex-1 border-t" style="border-color: var(--border);"></div>
      </div>
    {/if}

    <Message message={msg} {onOpenThread} {onOpenProfile} {grouped} {compact} />
  {:else}
    <div class="flex items-center justify-center h-full text-[12px] font-mono" style="color: var(--rc-timestamp);">
      <p>no messages yet</p>
    </div>
  {/each}
</div>
