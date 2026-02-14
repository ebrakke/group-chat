<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { websocket } from '$lib/stores/websocket.svelte';
  import type { LayoutData } from './$types';
  import './layout.css';
  
  let { data, children }: { data: LayoutData; children: any } = $props();
  
  let sidebarOpen = $state(false);
  
  // Connect WebSocket when app loads (if authenticated)
  onMount(() => {
    if (data.user && data.token) {
      websocket.connect(data.token);
    }
    
    // Listen for toggle sidebar events from child components
    window.addEventListener('toggle-sidebar', toggleSidebar);
    
    return () => {
      window.removeEventListener('toggle-sidebar', toggleSidebar);
    };
  });
  
  onDestroy(() => {
    websocket.disconnect();
  });
  
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
  
  function closeSidebar() {
    sidebarOpen = false;
  }
</script>

{#if data.user}
  <!-- Authenticated layout -->
  <div class="flex h-dvh bg-gray-50">
    <!-- Mobile backdrop -->
    {#if sidebarOpen}
      <div 
        class="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
        onclick={closeSidebar}
      ></div>
    {/if}
    
    <!-- Sidebar -->
    <Sidebar
      user={data.user}
      channels={data.channels}
      currentChannel={$page.params.channel}
      {sidebarOpen}
      onToggle={toggleSidebar}
    />
    
    <!-- Main content (routes render here) -->
    <main class="flex-1 flex flex-col min-w-0">
      {@render children()}
    </main>
  </div>
{:else}
  <!-- Unauthenticated layout (login, signup) -->
  {@render children()}
{/if}
