<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { channelStore } from '$lib/stores/channels';
  import { threadStore } from '$lib/stores/threads';
  import { authStore } from '$lib/stores/auth';
  import { wsManager } from '$lib/ws';
  import { isNative, isMobile } from '$lib/utils/platform';
  import { registerNativePush, unregisterNativePush, setupBackButton } from '$lib/utils/native';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();
  let sidebarOpen = $state(false);

  // Swipe gesture state
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  const EDGE_ZONE = 30;
  const MIN_DISTANCE = 60;
  const MAX_Y_DRIFT = 80;
  const MAX_DURATION = 500;

  onMount(async () => {
    channelStore.load();
    wsManager.connect();

    // Register native push notifications after auth + ws connect
    if (isNative() && authStore.user) {
      registerNativePush(authStore.user.id);
    }

    // Set up Android back button
    setupBackButton({
      closeThread: () => {
        if (threadStore.openThreadId !== null) {
          threadStore.closeThread();
          return true;
        }
        return false;
      },
      closeSidebar: () => {
        if (sidebarOpen && isMobile()) {
          sidebarOpen = false;
          return true;
        }
        return false;
      },
      goBack: () => {
        const pathname = $page.url.pathname;
        if (pathname.startsWith('/settings') || pathname.startsWith('/threads')) {
          goto('/channels');
          return true;
        }
        return false;
      }
    });
  });

  onDestroy(async () => {
    wsManager.disconnect();
  });

  function closeSidebar() {
    sidebarOpen = false;
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  }

  function handleTouchEnd(e: TouchEvent) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = Math.abs(touch.clientY - touchStartY);
    const duration = Date.now() - touchStartTime;

    if (duration > MAX_DURATION || dy > MAX_Y_DRIFT) return;

    // Right swipe from left edge -> open sidebar
    if (dx > MIN_DISTANCE && touchStartX < EDGE_ZONE) {
      sidebarOpen = true;
      return;
    }

    // Left swipe -> close sidebar
    if (dx < -MIN_DISTANCE && sidebarOpen) {
      sidebarOpen = false;
      return;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex h-screen bg-[#1e2024] text-gray-200"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
>
  <!-- Mobile toggle button -->
  <button
    id="sidebar-toggle"
    onclick={toggleSidebar}
    class="fixed top-3 left-3 z-40 md:hidden bg-gray-800 text-gray-200 p-2 rounded-lg shadow-lg"
    aria-label="Toggle sidebar"
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {#if sidebarOpen}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      {:else}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      {/if}
    </svg>
  </button>

  <!-- Mobile settings/admin button -->
  <button
    id="open-admin"
    onclick={() => goto('/settings')}
    class="fixed top-3 right-3 z-40 md:hidden bg-gray-800 text-gray-200 p-2 rounded-lg shadow-lg"
    aria-label="Settings"
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  </button>

  <!-- Mobile backdrop -->
  {#if sidebarOpen}
    <button
      id="sidebar-backdrop"
      onclick={closeSidebar}
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      aria-label="Close sidebar"
    ></button>
  {/if}

  <!-- Sidebar -->
  <div
    class="fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-0 {sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <Sidebar />
  </div>

  <!-- Main content area -->
  <main class="flex-1 flex flex-col min-w-0">
    {@render children()}
  </main>

  {#if !wsManager.connected}
    <div class="fixed bottom-4 right-4 bg-yellow-900/80 text-yellow-200 px-3 py-1.5 rounded text-xs z-50">
      Reconnecting...
    </div>
  {/if}
</div>
