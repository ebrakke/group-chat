<script lang="ts">
  import { goto } from '$app/navigation';
  import { searchStore } from '$lib/stores/search';
  import { formatRelativeTime } from '$lib/utils/time';

  let searchInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout>;
  let inputEl: HTMLInputElement | undefined = $state();

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchStore.search(searchInput);
    }, 300);
  }

  function navigateToResult(result: { channelId: number; parentId?: number }) {
    const url = `/channels/${result.channelId}` + (result.parentId ? `?thread=${result.parentId}` : '');
    goto(url);
    searchStore.close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchStore.close();
    }
  }

  // Auto-focus when mounted
  $effect(() => {
    if (inputEl) inputEl.focus();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex flex-col"
  style="background: var(--background);"
  onkeydown={handleKeydown}
>
  <!-- Header -->
  <div class="flex items-center gap-3 px-5 py-3 border-b shrink-0" style="border-color: var(--border);">
    <span class="text-[13px] font-bold" style="color: var(--foreground);">search</span>
    <input
      bind:this={inputEl}
      bind:value={searchInput}
      oninput={handleInput}
      placeholder="search messages..."
      class="flex-1 bg-transparent outline-none text-[13px] font-mono placeholder:opacity-40"
      style="color: var(--foreground);"
    />
    <button
      onclick={() => searchStore.close()}
      class="text-[11px] px-2 py-1 hover:underline"
      style="color: var(--rc-timestamp);"
    >close</button>
  </div>

  <!-- Results -->
  <div class="flex-1 overflow-y-auto px-5 py-3">
    {#if searchStore.loading}
      <p class="text-[12px]" style="color: var(--rc-timestamp);">searching...</p>
    {:else if searchStore.query && searchStore.results.length === 0}
      <p class="text-[12px]" style="color: var(--rc-timestamp);">no results found</p>
    {:else}
      {#each searchStore.results as result (result.id)}
        <button
          class="w-full text-left px-3 py-2 mb-1 border rounded hover:opacity-80 cursor-pointer"
          style="border-color: var(--border); background: var(--rc-muted);"
          onclick={() => navigateToResult(result)}
        >
          <div class="flex items-baseline gap-2">
            <span class="text-[11px]" style="color: var(--rc-olive);">#{result.channelName}</span>
            <span class="text-[11px] font-bold" style="color: var(--foreground);">{result.displayName}</span>
            <span class="text-[10px]" style="color: var(--rc-timestamp);">{formatRelativeTime(result.createdAt)}</span>
          </div>
          <p class="text-[12px] mt-0.5 line-clamp-2" style="color: var(--foreground);">
            {result.content}
          </p>
          {#if result.parentId}
            <span class="text-[10px] mt-0.5 inline-block" style="color: var(--rc-timestamp);">in thread</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
