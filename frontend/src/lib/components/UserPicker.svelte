<script lang="ts">
  import { api } from '$lib/api';
  import { dmStore } from '$lib/stores/dms.svelte';
  import { goto } from '$app/navigation';
  import type { User } from '$lib/types';
  import { authStore } from '$lib/stores/auth';
  import { portal } from '$lib/actions/portal';

  let { onClose }: { onClose: () => void } = $props();

  let query = $state('');
  let results = $state<User[]>([]);
  let searching = $state(false);
  let starting = $state(false);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 1) {
      results = [];
      return;
    }
    searching = true;
    try {
      const users = await api<User[]>('GET', `/api/users/search?q=${encodeURIComponent(q)}`);
      results = users.filter((u) => u.id !== authStore.user?.id && !u.isBot);
    } catch {
      results = [];
    }
    searching = false;
  }

  async function selectUser(user: User) {
    starting = true;
    try {
      const conv = await dmStore.startDM(user.id);
      onClose();
      goto(`/dms/${conv.id}`);
    } catch {
      // silently fail
    }
    starting = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  use:portal
  class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
  role="dialog"
  aria-modal="true"
  aria-label="New direct message"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="p-6 w-full max-w-md mx-4 border" style="background: var(--background); border-color: var(--border);">
    <h2 class="text-[14px] font-bold mb-4" style="color: var(--foreground);">New Direct Message</h2>

    <input
      type="text"
      bind:value={query}
      oninput={handleSearch}
      placeholder="Search users..."
      class="w-full px-3 py-2 text-[13px] border outline-none mb-3"
      style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
    />

    <ul class="max-h-60 overflow-y-auto">
      {#each results as user (user.id)}
        <li>
          <button
            onclick={() => selectUser(user)}
            disabled={starting}
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80"
            style="color: var(--foreground);"
          >
            {#if user.avatarUrl}
              <img src={user.avatarUrl} alt="" class="w-6 h-6 rounded-full object-cover" />
            {:else}
              <span
                class="inline-flex items-center justify-center w-6 h-6 text-[11px] border shrink-0"
                style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);"
              >{user.displayName.charAt(0).toUpperCase()}</span>
            {/if}
            <div class="flex flex-col leading-tight min-w-0">
              <span class="text-[13px] truncate">{user.displayName}</span>
              <span class="text-[10px] truncate" style="color: var(--rc-timestamp);">@{user.username}</span>
            </div>
          </button>
        </li>
      {/each}
      {#if query.trim() && results.length === 0 && !searching}
        <li class="px-3 py-2 text-[12px]" style="color: var(--rc-timestamp);">No users found</li>
      {/if}
    </ul>

    <div class="flex justify-end mt-3">
      <button
        onclick={onClose}
        class="px-3 py-1.5 text-[12px] hover:underline"
        style="color: var(--rc-timestamp);"
      >Cancel</button>
    </div>
  </div>
</div>
