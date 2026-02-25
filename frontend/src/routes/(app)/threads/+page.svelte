<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { threadStore } from '$lib/stores/threads';
  import { formatRelativeTime } from '$lib/utils/time';

  let loading = $state(true);

  onMount(async () => {
    try {
      await threadStore.loadMyThreads();
    } catch {
      // ignore load errors
    }
    loading = false;
  });

  function navigateToThread(channelId: number, parentId: number) {
    goto(`/channels/${channelId}?thread=${parentId}`);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center px-4 py-3 border-b border-gray-800 shrink-0">
    <h2 class="text-lg font-bold text-white">My Threads</h2>
  </div>

  <!-- Thread list -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center h-full text-gray-500">
        <p>Loading threads...</p>
      </div>
    {:else if threadStore.myThreads.length === 0}
      <div class="flex items-center justify-center h-full text-gray-500">
        <p>No threads yet</p>
      </div>
    {:else}
      {#each threadStore.myThreads as thread (thread.parentId)}
        <button
          class="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
          onclick={() => navigateToThread(thread.channelId, thread.parentId)}
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-300">
              #{thread.channelName}
            </span>
            <span class="text-xs text-gray-500">
              {formatRelativeTime(thread.lastActivityAt)}
            </span>
          </div>
          <div class="text-sm text-gray-200 truncate">
            <span class="font-medium">{thread.authorDisplayName}:</span>
            {thread.contentPreview}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>
