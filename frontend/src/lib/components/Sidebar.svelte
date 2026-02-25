<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { channelStore } from '$lib/stores/channels';

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

<aside class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-64">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
    <h1 class="text-lg font-bold text-white">Relay Chat</h1>
  </div>

  <!-- Channel list -->
  <div class="flex-1 overflow-y-auto py-2">
    <div class="flex items-center justify-between px-4 py-1">
      <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Channels</span>
      <button
        onclick={openCreateModal}
        class="text-gray-400 hover:text-white text-lg leading-none px-1"
        title="Create channel"
      >
        +
      </button>
    </div>

    <ul class="channel-list">
      {#each channelStore.channels as channel (channel.id)}
        <li>
          <button
            onclick={() => navigateToChannel(channel.id)}
            class="flex items-center w-full px-4 py-1.5 text-sm text-left transition-colors {channelStore.activeChannelId ===
            channel.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}"
          >
            <span class="text-gray-500 mr-1.5">#</span>
            <span class="truncate flex-1">{channel.name}</span>
            {#if channel.hasMention}
              <span
                class="ml-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
                >@</span
              >
            {:else if channel.unreadCount}
              <span
                class="ml-2 bg-gray-600 text-white text-xs font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1 shrink-0"
                >{channel.unreadCount}</span
              >
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <!-- Bottom section -->
  <div class="border-t border-gray-800 p-3 space-y-1">
    <button
      onclick={() => goto('/threads')}
      class="flex items-center w-full px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 rounded transition-colors"
    >
      My Threads
    </button>
    <button
      id="open-settings-btn"
      onclick={() => goto('/settings')}
      class="flex items-center w-full px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 rounded transition-colors"
    >
      Settings
    </button>
    {#if authStore.isAdmin}
      <div class="admin-section hidden md:block">
        <button
          id="toggle-admin"
          onclick={() => goto('/settings')}
          class="flex items-center w-full px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 rounded transition-colors"
        >
          Admin Panel
        </button>
      </div>
    {/if}

    <!-- User info -->
    <div class="user-info flex items-center justify-between pt-2 border-t border-gray-800 mt-2">
      <div class="flex items-center min-w-0">
        <div
          class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0"
        >
          {authStore.user?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div class="ml-2 min-w-0">
          <p class="text-sm font-medium text-white truncate">{authStore.user?.displayName}</p>
          <p class="text-xs text-gray-500 truncate">@{authStore.user?.username}</p>
        </div>
      </div>
      <button
        id="logout"
        onclick={() => {
          authStore.logout();
          goto('/login');
        }}
        class="text-xs text-gray-500 hover:text-gray-300 shrink-0 ml-2"
        title="Logout"
      >
        Logout
      </button>
    </div>
  </div>
</aside>

<!-- Create Channel Modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Create channel"
    tabindex="-1"
    onkeydown={handleModalKeydown}
  >
    <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
      <h2 class="text-lg font-bold text-white mb-4">Create Channel</h2>

      {#if createError}
        <p class="text-red-400 text-sm mb-3">{createError}</p>
      {/if}

      <label class="block mb-4">
        <span class="text-sm text-gray-300 mb-1 block">Channel name</span>
        <div class="flex items-center bg-gray-900 rounded border border-gray-700 focus-within:border-blue-500">
          <span class="text-gray-500 pl-3">#</span>
          <input
            type="text"
            value={newChannelName}
            oninput={handleNameInput}
            onkeydown={handleCreateKeydown}
            placeholder="new-channel"
            class="flex-1 bg-transparent px-2 py-2 text-white text-sm outline-none placeholder-gray-600"
          />
        </div>
      </label>

      <div class="flex justify-end gap-3">
        <button
          onclick={closeCreateModal}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleCreate}
          disabled={creating || !newChannelName.trim()}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}
