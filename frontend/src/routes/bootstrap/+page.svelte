<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await authStore.bootstrap(username, password, displayName);
      goto('/channels');
    } catch (err: any) {
      error = err.message || 'Bootstrap failed';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-950 text-gray-100">
  <div class="w-full max-w-md p-8">
    <h1 class="text-3xl font-bold text-center mb-2">Relay Chat</h1>
    <p class="text-gray-400 text-center mb-8">Create your admin account to get started</p>

    <form onsubmit={handleSubmit} class="space-y-4">
      {#if error}
        <div class="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
          {error}
        </div>
      {/if}

      <div>
        <label for="username" class="block text-sm font-medium text-gray-300 mb-1">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="admin"
        />
      </div>

      <div>
        <label for="display-name" class="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
        <input
          id="display-name"
          type="text"
          bind:value={displayName}
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Admin User"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter a strong password"
        />
      </div>

      <button
        id="submit"
        type="submit"
        disabled={submitting}
        class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
      >
        {submitting ? 'Creating...' : 'Create Admin Account'}
      </button>
    </form>
  </div>
</div>
