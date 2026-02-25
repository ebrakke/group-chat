<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { isNative } from '$lib/utils/platform';

  let { children } = $props();

  let needsServerConfig = $state(false);
  let serverUrlInput = $state('');
  let serverConfigError = $state('');
  let serverConfigLoading = $state(false);

  const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite'];

  function isPublicRoute(pathname: string): boolean {
    return publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));
  }

  onMount(async () => {
    // On native, if no serverUrl is configured and we're on localhost, show config screen
    if (isNative() && !localStorage.getItem('serverUrl') && location.hostname === 'localhost') {
      needsServerConfig = true;
      return;
    }

    await authStore.checkHasUsers();
    await authStore.checkAuth();

    // Register service worker (web only, not native)
    if ('serviceWorker' in navigator && !isNative()) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  });

  async function connectToServer() {
    serverConfigError = '';
    serverConfigLoading = true;

    let url = serverUrlInput.trim();
    // Remove trailing slash
    if (url.endsWith('/')) url = url.slice(0, -1);

    if (!url) {
      serverConfigError = 'Please enter a server URL.';
      serverConfigLoading = false;
      return;
    }

    try {
      const res = await fetch(`${url}/api/health`);
      if (!res.ok) throw new Error('Server returned an error');
      localStorage.setItem('serverUrl', url);
      window.location.reload();
    } catch {
      serverConfigError = 'Could not connect to server. Check the URL and try again.';
    } finally {
      serverConfigLoading = false;
    }
  }

  $effect(() => {
    if (authStore.loading || needsServerConfig) return;

    const pathname = $page.url.pathname;

    if (!authStore.hasUsers && pathname !== '/bootstrap') {
      goto('/bootstrap');
      return;
    }

    if (!authStore.isLoggedIn && !isPublicRoute(pathname)) {
      goto('/login');
      return;
    }

    if (authStore.isLoggedIn && isPublicRoute(pathname)) {
      goto('/channels');
      return;
    }
  });
</script>

{#if needsServerConfig}
  <div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
    <div class="w-full max-w-sm px-6">
      <h1 class="text-2xl font-bold mb-6 text-center">Relay Chat</h1>
      <p class="text-gray-400 text-sm mb-4 text-center">Enter your server URL to connect.</p>

      <form
        onsubmit={(e) => {
          e.preventDefault();
          connectToServer();
        }}
      >
        <input
          type="url"
          bind:value={serverUrlInput}
          placeholder="https://chat.example.com"
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
        />

        {#if serverConfigError}
          <p class="text-red-400 text-sm mb-3">{serverConfigError}</p>
        {/if}

        <button
          type="submit"
          disabled={serverConfigLoading}
          class="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
        >
          {serverConfigLoading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  </div>
{:else if authStore.loading}
  <div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
    <p>Loading...</p>
  </div>
{:else}
  {@render children()}
{/if}
