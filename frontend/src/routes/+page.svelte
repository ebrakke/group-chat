<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  let loading = $state(true);
  let isFirstUser = $state(false);
  let user: any = $state(null);
  let channels: any[] = $state([]);
  let currentChannel = $state('general');
  
  // Signup form state (for first user)
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let signupError = $state('');
  let signingUp = $state(false);
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  
  onMount(async () => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      // Check if this is the first user (no signup requires invite)
      try {
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token || 'none'}`,
          },
        });
        
        if (response.status === 401) {
          // Not authenticated - check if first user by trying to get channels
          const channelsResponse = await fetch(`${API_URL}/api/v1/channels`, {
            headers: {
              'Authorization': `Bearer none`,
            },
          });
          
          if (channelsResponse.status === 401) {
            // No auth - this might be first user
            isFirstUser = true;
            loading = false;
            return;
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      }
      
      loading = false;
      goto('/login');
      return;
    }
    
    try {
      // Verify token is still valid
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        goto('/login');
        return;
      }
      
      user = await response.json();
      
      // Load channels
      await loadChannels(token);
      
      loading = false;
    } catch (err) {
      console.error('Error loading user data:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      goto('/login');
    }
  });
  
  async function loadChannels(token: string) {
    try {
      const response = await fetch(`${API_URL}/api/v1/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        channels = await response.json();
      }
    } catch (err) {
      console.error('Error loading channels:', err);
    }
  }
  
  async function handleFirstUserSignup(e: SubmitEvent) {
    e.preventDefault();
    
    signupError = '';
    signingUp = true;
    
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          displayName,
          // No invite code for first user
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        signupError = data.error || 'Signup failed';
        return;
      }
      
      // Store token in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Reload page to show main interface
      window.location.reload();
    } catch (err: any) {
      signupError = err.message || 'Network error';
    } finally {
      signingUp = false;
    }
  }
  
  async function handleLogout() {
    const token = localStorage.getItem('token');
    
    if (token) {
      try {
        await fetch(`${API_URL}/api/v1/auth/logout`, {
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
</script>

{#if loading}
  <div class="flex min-h-screen items-center justify-center">
    <p class="text-gray-600">Loading...</p>
  </div>
{:else if isFirstUser}
  <!-- First user signup form -->
  <div class="flex min-h-screen items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-md">
      <div class="text-center">
        <h1 class="text-3xl font-bold text-gray-900">Welcome to Relay Chat</h1>
        <p class="mt-2 text-sm text-gray-600">Create the first admin account</p>
      </div>
      
      {#if signupError}
        <div class="rounded-md bg-red-50 p-4">
          <p class="text-sm text-red-800">{signupError}</p>
        </div>
      {/if}
      
      <form class="space-y-4" onsubmit={handleFirstUserSignup}>
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700">
            Username
          </label>
          <input
            id="username"
            type="text"
            bind:value={username}
            required
            minlength={3}
            maxlength={20}
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="admin"
          />
        </div>
        
        <div>
          <label for="displayName" class="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            bind:value={displayName}
            required
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Admin"
          />
        </div>
        
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        
        <button
          type="submit"
          disabled={signingUp}
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingUp ? 'Creating account...' : 'Create Admin Account'}
        </button>
      </form>
    </div>
  </div>
{:else}
  <!-- Main chat interface -->
  <div class="flex h-screen bg-gray-50">
    <!-- Sidebar -->
    <aside class="w-60 border-r bg-white flex flex-col">
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold text-gray-900">Relay Chat</h2>
      </div>
      
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Channels</p>
        {#each channels as channel}
          <button
            onclick={() => currentChannel = channel.id}
            class="block w-full text-left px-3 py-2 rounded-md text-sm {currentChannel === channel.id ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}"
          >
            # {channel.name}
          </button>
        {/each}
      </nav>
      
      <div class="border-t p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
              {user?.displayName?.charAt(0).toUpperCase() || '?'}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{user?.displayName}</p>
              <p class="text-xs text-gray-500 truncate">@{user?.username}</p>
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
        
        {#if user?.role === 'admin'}
          <a href="/admin" class="mt-3 block text-center text-sm text-blue-600 hover:text-blue-700">
            Admin Panel
          </a>
        {/if}
      </div>
    </aside>

    <!-- Main chat area -->
    <main class="flex-1 flex flex-col">
      <header class="border-b bg-white px-6 py-4">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold text-gray-900">
            # {channels.find(c => c.id === currentChannel)?.name || currentChannel}
          </h1>
          <p class="text-sm text-gray-500">
            {channels.find(c => c.id === currentChannel)?.description || ''}
          </p>
        </div>
      </header>
      
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div class="text-center text-gray-500">
          <p class="text-sm">No messages yet. Say something!</p>
          <p class="text-xs mt-2 text-gray-400">
            (Messages will appear here once messaging is implemented in Sprint 2)
          </p>
        </div>
      </div>
      
      <div class="border-t bg-white p-4">
        <input
          type="text"
          placeholder="Message #{channels.find(c => c.id === currentChannel)?.name || currentChannel}"
          disabled
          class="w-full rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <p class="text-xs text-gray-500 mt-2">
          Message sending will be implemented in Sprint 2
        </p>
      </div>
    </main>
  </div>
{/if}
