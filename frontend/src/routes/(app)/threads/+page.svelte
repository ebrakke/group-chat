<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { threadStore } from '$lib/stores/threads';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { formatRelativeTime } from '$lib/utils/time';

  let loading = $state(true);

  onMount(async () => {
    try {
      await threadStore.loadMyThreads();
    } catch {
      toastStore.error('Failed to load threads');
    }
    loading = false;
  });

  function navigateToThread(channelId: number, parentId: number) {
    goto(`/channels/${channelId}?thread=${parentId}`);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center px-5 py-3 border-b shrink-0" style="border-color: var(--border);">
    <span class="text-[13px] font-bold" style="color: var(--foreground);">my threads</span>
  </div>

  <!-- Thread list -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center h-full text-[12px]" style="color: var(--rc-timestamp);">
        <p>loading threads...</p>
      </div>
    {:else if threadStore.myThreads.length === 0}
      <div class="flex items-center justify-center h-full text-[12px]" style="color: var(--rc-timestamp);">
        <p>no threads yet</p>
      </div>
    {:else}
      {#each threadStore.myThreads as thread (thread.parentId)}
        <button
          class="w-full text-left px-5 py-3 border-b transition-colors hover:opacity-80"
          style="border-color: var(--border);"
          onclick={() => navigateToThread(thread.channelId, thread.parentId)}
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-[12px]" style="color: var(--rc-timestamp);">
              #{thread.channelName}
            </span>
            <span class="text-[11px]" style="color: var(--rc-timestamp);">
              {formatRelativeTime(thread.lastActivityAt)}
            </span>
          </div>
          <div class="text-[13px] truncate" style="color: var(--foreground);">
            <span class="font-bold">{thread.authorDisplayName}:</span>
            {thread.contentPreview}
          </div>
          <div class="text-[11px] mt-1" style="color: var(--rc-olive);">
            {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>
