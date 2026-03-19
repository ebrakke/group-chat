<script lang="ts">
  import '../app.css';
  import '$lib/stores/theme.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let { children } = $props();

  const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite', '/welcome'];

  function isPublicRoute(pathname: string): boolean {
    return publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));
  }

  onMount(async () => {
    await authStore.checkHasUsers();
    await authStore.checkAuth();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  });

  $effect(() => {
    if (authStore.loading) return;

    const pathname = $page.url.pathname;

    if (!authStore.hasUsers && pathname !== '/bootstrap') {
      goto('/bootstrap');
      return;
    }

    if (!authStore.isLoggedIn && !isPublicRoute(pathname)) {
      goto('/login');
      return;
    }

    if (authStore.isLoggedIn && (isPublicRoute(pathname) || pathname === '/')) {
      goto('/channels');
      return;
    }
  });
</script>

{#if authStore.loading}
  <div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
    <p>Loading...</p>
  </div>
{:else}
  {@render children()}
{/if}
