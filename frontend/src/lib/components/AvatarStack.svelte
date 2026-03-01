<script lang="ts">
  import type { ReplyParticipant } from '$lib/types';
  import Avatar from './Avatar.svelte';

  let {
    participants,
    totalCount,
    size = 20
  }: {
    participants: ReplyParticipant[];
    totalCount: number;
    size?: number;
  } = $props();

  const overflow = $derived(totalCount - participants.length);
  const fontSize = $derived(Math.round(size * 0.45));
</script>

<div class="flex items-center">
  {#each participants as p, i (p.userId)}
    <div
      class="rounded-full border-2 shrink-0"
      style="border-color: var(--background); {i > 0 ? `margin-left: -${Math.round(size * 0.3)}px;` : ''} z-index: {participants.length - i}; position: relative;"
    >
      <Avatar url={p.avatarUrl} displayName={p.displayName} username={p.username} {size} />
    </div>
  {/each}
  {#if overflow > 0}
    <div
      class="rounded-full shrink-0 flex items-center justify-center font-bold select-none border-2"
      style="width: {size}px; height: {size}px; background: var(--rc-muted); color: var(--foreground); font-size: {fontSize}px; margin-left: -{Math.round(size * 0.3)}px; z-index: 0; position: relative; border-color: var(--background);"
    >
      +{overflow}
    </div>
  {/if}
</div>
