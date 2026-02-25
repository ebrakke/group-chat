<script lang="ts">
  import { onMount } from 'svelte';
  import { channelStore } from '$lib/stores/channels';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();
  let sidebarOpen = $state(false);

  onMount(() => {
    channelStore.load();
  });

  function closeSidebar() {
    sidebarOpen = false;
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
</script>

<div class="flex h-screen bg-gray-950 text-gray-200">
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
</div>
