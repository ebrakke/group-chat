<script lang="ts">
  import { createChannel, updateChannel, deleteChannel, type Channel } from '$lib/api';
  
  export let isOpen = $state(false);
  export let mode: 'create' | 'edit' = $state('create');
  export let channel: Channel | null = $state(null);
  export let onClose: (() => void) | undefined = undefined;
  export let onSuccess: ((channel: Channel) => void) | undefined = undefined;
  export let onDelete: ((channelId: string) => void) | undefined = undefined;
  
  let id = $state('');
  let name = $state('');
  let description = $state('');
  let error = $state('');
  let submitting = $state(false);
  let showDeleteConfirm = $state(false);
  
  $effect(() => {
    if (isOpen && mode === 'edit' && channel) {
      id = channel.id;
      name = channel.name;
      description = channel.description;
    } else if (isOpen && mode === 'create') {
      id = '';
      name = '';
      description = '';
    }
    error = '';
    showDeleteConfirm = false;
  });
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    submitting = true;
    
    try {
      if (mode === 'create') {
        // Validate ID format
        if (!/^[a-zA-Z0-9_-]{2,30}$/.test(id)) {
          error = 'Channel ID must be 2-30 characters, alphanumeric, dashes, or underscores';
          submitting = false;
          return;
        }
        
        const newChannel = await createChannel(id, name, description);
        if (onSuccess) onSuccess(newChannel);
        close();
      } else if (mode === 'edit' && channel) {
        const updatedChannel = await updateChannel(channel.id, name, description);
        if (onSuccess) onSuccess(updatedChannel);
        close();
      }
    } catch (err: any) {
      error = err.message || 'Operation failed';
    } finally {
      submitting = false;
    }
  }
  
  async function handleDelete() {
    if (!channel || channel.id === 'general') {
      error = 'Cannot delete #general channel';
      return;
    }
    
    if (!showDeleteConfirm) {
      showDeleteConfirm = true;
      return;
    }
    
    submitting = true;
    error = '';
    
    try {
      await deleteChannel(channel.id);
      if (onDelete) onDelete(channel.id);
      close();
    } catch (err: any) {
      error = err.message || 'Delete failed';
    } finally {
      submitting = false;
    }
  }
  
  function close() {
    isOpen = false;
    showDeleteConfirm = false;
    if (onClose) onClose();
  }
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    onclick={handleBackdropClick}
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-xl font-semibold text-gray-900">
          {mode === 'create' ? 'Create Channel' : 'Edit Channel'}
        </h2>
        <button
          onclick={close}
          class="text-gray-400 hover:text-gray-600"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <!-- Form -->
      <form onsubmit={handleSubmit} class="px-6 py-4 space-y-4">
        {#if error}
          <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-800">{error}</p>
          </div>
        {/if}
        
        {#if mode === 'create'}
          <div>
            <label for="channel-id" class="block text-sm font-medium text-gray-700 mb-1">
              Channel ID
            </label>
            <input
              id="channel-id"
              type="text"
              bind:value={id}
              required
              pattern="[a-zA-Z0-9_-]+"
              minlength="2"
              maxlength="30"
              placeholder="my-channel"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-gray-500 mt-1">
              2-30 characters, alphanumeric, dashes, or underscores
            </p>
          </div>
        {/if}
        
        <div>
          <label for="channel-name" class="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <input
            id="channel-name"
            type="text"
            bind:value={name}
            required
            placeholder="My Channel"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label for="channel-description" class="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="channel-description"
            bind:value={description}
            rows="3"
            placeholder="What's this channel about?"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
        </div>
        
        <!-- Actions -->
        <div class="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting || !name.trim() || (mode === 'create' && !id.trim())}
            class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
          </button>
          <button
            type="button"
            onclick={close}
            class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
        
        {#if mode === 'edit' && channel && channel.id !== 'general'}
          <div class="pt-4 border-t">
            {#if showDeleteConfirm}
              <div class="bg-red-50 border border-red-200 rounded-md p-4">
                <p class="text-sm text-red-800 font-medium mb-3">
                  Are you sure you want to delete this channel? This action cannot be undone.
                </p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={handleDelete}
                    disabled={submitting}
                    class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onclick={() => showDeleteConfirm = false}
                    class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <button
                type="button"
                onclick={handleDelete}
                class="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete Channel
              </button>
            {/if}
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}
