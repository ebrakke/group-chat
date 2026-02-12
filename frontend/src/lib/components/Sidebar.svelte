<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Channel, User } from '$lib/api';
  
  interface Props {
    user: User;
    channels: Channel[];
    currentChannel?: string;
    sidebarOpen: boolean;
    onToggle: () => void;
    onCreateChannel?: () => void;
  }
  
  let { 
    user, 
    channels, 
    currentChannel, 
    sidebarOpen, 
    onToggle,
    onCreateChannel 
  }: Props = $props();
  
  function switchChannel(channelName: string) {
    goto(`/${channelName}`);
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 768) {
      onToggle();
    }
  }
  
  async function handleLogout() {
    const token = localStorage.getItem('token');
    
    if (token) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    goto('/login');
  }
  
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
</script>

<aside class="
  w-60 border-r bg-white flex flex-col
  fixed md:static inset-y-0 left-0 z-30
  transform transition-transform duration-300 ease-in-out
  {sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
">
  <div class="p-4 border-b">
    <h2 class="text-lg font-semibold text-gray-900">Relay Chat</h2>
  </div>
  
  <nav class="flex-1 overflow-y-auto p-4 space-y-1">
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs font-semibold text-gray-500 uppercase">Channels</p>
      {#if onCreateChannel}
        <button
          onclick={onCreateChannel}
          class="text-gray-500 hover:text-gray-700"
          title="Create channel"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      {/if}
    </div>
    {#each channels as channel}
      <button
        onclick={() => switchChannel(channel.name)}
        class="block w-full text-left px-3 py-2 rounded-md text-sm transition-colors
               {currentChannel === channel.name 
                 ? 'bg-blue-100 text-blue-900 font-medium' 
                 : 'text-gray-700 hover:bg-gray-100'}"
      >
        # {channel.name}
      </button>
    {/each}
  </nav>
  
  <div class="border-t p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
          {getInitials(user.displayName)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
          <p class="text-xs text-gray-500 truncate">@{user.username}</p>
        </div>
      </div>
      <button
        onclick={handleLogout}
        class="text-gray-400 hover:text-gray-600"
        title="Logout"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
    
    {#if user.role === 'admin'}
      <a href="/admin" class="mt-3 block text-center text-sm text-blue-600 hover:text-blue-700">
        Admin Panel
      </a>
    {/if}
    
    {#if user.role === 'admin'}
      <a href="/settings" class="mt-2 block text-center text-sm text-gray-600 hover:text-gray-700">
        Settings
      </a>
    {/if}
  </div>
</aside>
