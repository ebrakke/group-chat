<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { channelStore } from '$lib/stores/channels';
  import { searchStore } from '$lib/stores/search';
  import { stopNativeNotifications } from '$lib/utils/native';

  let { onCloseSidebar }: { onCloseSidebar?: () => void } = $props();

  let showCreateModal = $state(false);
  let newChannelName = $state('');
  let createError = $state('');
  let creating = $state(false);

  function formatChannelName(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  function handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    newChannelName = formatChannelName(input.value);
    input.value = newChannelName;
  }

  function navigateToChannel(id: number) {
    goto(`/channels/${id}`);
    onCloseSidebar?.();
  }

  async function handleCreate() {
    const name = newChannelName.trim();
    if (!name) return;

    creating = true;
    createError = '';
    try {
      const channel = await channelStore.create(name);
      showCreateModal = false;
      newChannelName = '';
      goto(`/channels/${channel.id}`);
      onCloseSidebar?.();
    } catch (err: unknown) {
      createError = err instanceof Error ? err.message : 'Failed to create channel';
    } finally {
      creating = false;
    }
  }

  function openCreateModal() {
    newChannelName = '';
    createError = '';
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    newChannelName = '';
    createError = '';
  }

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeCreateModal();
  }

  function handleCreateKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !creating) handleCreate();
  }
</script>

<aside
  class="flex flex-col h-full w-52 shrink-0 border-r"
  style="background: var(--rc-sidebar-bg); border-color: var(--border);"
>
  <!-- Wordmark -->
  <div class="px-4 py-3 border-b" style="border-color: var(--border);">
    <span class="text-[14px] font-bold tracking-tight" style="color: var(--foreground);">relay</span><span class="text-[14px]" style="color: var(--rc-timestamp);">.chat</span>
  </div>

  <!-- Nav -->
  <nav class="flex-1 overflow-y-auto pt-3" aria-label="Channels">
    <div class="flex items-center justify-between px-4 pb-1">
      <span
        class="text-[10px] uppercase tracking-[0.12em]"
        style="color: var(--rc-timestamp);"
      >channels</span>
      <button
        onclick={openCreateModal}
        class="text-[16px] leading-none hover:opacity-70 p-1"
        style="color: var(--rc-timestamp);"
        title="Create channel"
      >+</button>
    </div>

    <ul class="channel-list">
      {#each channelStore.channels as channel (channel.id)}
        {@const active = channelStore.activeChannelId === channel.id}
        <li>
          <button
            onclick={() => navigateToChannel(channel.id)}
            class="w-full flex items-center gap-1.5 px-4 py-2 text-[13px] text-left"
            style="background: {active ? 'var(--rc-channel-active-bg)' : 'transparent'}; color: {active ? 'var(--rc-channel-active-fg)' : 'var(--foreground)'};"
            aria-current={active ? 'page' : undefined}
          >
            <span style="color: {active ? 'var(--rc-channel-active-fg)' : 'var(--rc-timestamp)'};">#</span>
            <span class="flex-1 truncate">{channel.name}</span>
            {#if channel.hasMention}
              <span
                class="text-[10px] px-1 py-[1px] ml-auto leading-none"
                style="background: var(--rc-mention-badge); color: oklch(0.97 0 0);"
              >@</span>
            {:else if channel.unreadCount}
              <span
                class="text-[11px] tabular-nums ml-auto"
                style="color: var(--rc-olive);"
              >{channel.unreadCount}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <!-- Footer -->
  <div class="border-t px-4 pt-3 pb-3 flex flex-col gap-[6px]" style="border-color: var(--border);">
    <button
      onclick={() => { searchStore.toggle(); onCloseSidebar?.(); }}
      class="text-left text-[12px] hover:underline underline-offset-2 py-1"
      style="color: var(--rc-timestamp);"
    >search</button>
    <button
      onclick={() => { goto('/threads'); onCloseSidebar?.(); }}
      class="text-left text-[12px] hover:underline underline-offset-2 py-1"
      style="color: var(--rc-timestamp);"
    >my threads</button>
    <button
      id="open-settings-btn"
      onclick={() => { goto('/settings'); onCloseSidebar?.(); }}
      class="text-left text-[12px] hover:underline underline-offset-2 py-1"
      style="color: var(--rc-timestamp);"
    >settings</button>
    {#if authStore.isAdmin}
      <button
        id="toggle-admin"
        onclick={() => { goto('/settings'); onCloseSidebar?.(); }}
        class="text-left text-[12px] hover:underline underline-offset-2 py-1"
        style="color: var(--rc-timestamp);"
      >admin</button>
    {/if}

    <!-- User info -->
    <div class="user-info mt-2 pt-2 border-t flex items-center gap-2" style="border-color: var(--border);">
      <span
        class="inline-flex items-center justify-center w-6 h-6 text-[11px] border shrink-0"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);"
        aria-hidden="true"
      >{authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}</span>
      <div class="flex flex-col leading-tight min-w-0">
        <span class="text-[12px] truncate" style="color: var(--foreground);">{authStore.user?.displayName}</span>
        <span class="text-[10px] truncate" style="color: var(--rc-timestamp);">@{authStore.user?.username}</span>
      </div>
      <button
        id="logout"
        onclick={async () => {
          await stopNativeNotifications();
          authStore.logout();
          goto('/login');
        }}
        class="ml-auto text-[11px] hover:underline shrink-0"
        style="color: var(--rc-timestamp);"
      >out</button>
    </div>
  </div>
</aside>

<!-- Create Channel Modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Create channel"
    tabindex="-1"
    onkeydown={handleModalKeydown}
  >
    <div class="p-6 w-full max-w-md mx-4 border"
         style="background: var(--background); border-color: var(--border);">
      <h2 class="text-[14px] font-bold mb-4" style="color: var(--foreground);">Create Channel</h2>

      {#if createError}
        <p class="text-[12px] mb-3" style="color: var(--rc-mention-badge);">{createError}</p>
      {/if}

      <label class="block mb-4">
        <span class="text-[12px] mb-1 block" style="color: var(--rc-timestamp);">Channel name</span>
        <div class="flex items-center border"
             style="border-color: var(--border); background: var(--rc-input-bg);">
          <span class="pl-3 text-[13px]" style="color: var(--rc-timestamp);">#</span>
          <input
            type="text"
            value={newChannelName}
            oninput={handleNameInput}
            onkeydown={handleCreateKeydown}
            placeholder="new-channel"
            class="flex-1 bg-transparent px-2 py-2 text-[13px] outline-none font-mono placeholder:opacity-40"
            style="color: var(--foreground);"
          />
        </div>
      </label>

      <div class="flex justify-end gap-3">
        <button
          onclick={closeCreateModal}
          class="px-3 py-1.5 text-[12px] hover:underline"
          style="color: var(--rc-timestamp);"
        >Cancel</button>
        <button
          onclick={handleCreate}
          disabled={creating || !newChannelName.trim()}
          class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >{creating ? 'Creating...' : 'Create'}</button>
      </div>
    </div>
  </div>
{/if}
