<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  const code = $derived($page.params.code);
  
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let validating = $state(true);
  let inviteValid = $state(false);
  let workspaceName = $state('');
  
  const API_URL = import.meta.env.VITE_API_URL || '';
  
  onMount(async () => {
    // Validate invite code
    try {
      const response = await fetch(`${API_URL}/api/v1/invites/${code}`);
      const data = await response.json();
      
      if (response.ok && data.valid) {
        inviteValid = true;
        workspaceName = data.workspaceName || 'Relay Chat';
      } else {
        error = data.error || 'Invalid invite code';
      }
    } catch (err: any) {
      error = err.message || 'Failed to validate invite';
    } finally {
      validating = false;
    }
  });
  
  async function handleSignup(e: SubmitEvent) {
    e.preventDefault();
    
    error = '';
    loading = true;
    
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
          inviteCode: code,
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        error = data.error || 'Signup failed';
        return;
      }
      
      // Store token in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Redirect to main page
      goto('/');
    } catch (err: any) {
      error = err.message || 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
  <div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-md">
    {#if validating}
      <div class="text-center">
        <p class="text-gray-600">Validating invite...</p>
      </div>
    {:else if !inviteValid}
      <div class="text-center space-y-4">
        <h1 class="text-2xl font-bold text-gray-900">Invalid Invite</h1>
        <div class="rounded-md bg-red-50 p-4">
          <p class="text-sm text-red-800">{error}</p>
        </div>
        <a href="/login" class="text-blue-600 hover:text-blue-700 text-sm">
          Go to login
        </a>
      </div>
    {:else}
      <div class="text-center">
        <h1 class="text-3xl font-bold text-gray-900">Join {workspaceName}</h1>
        <p class="mt-2 text-sm text-gray-600">Create your account</p>
      </div>
      
      {#if error}
        <div class="rounded-md bg-red-50 p-4">
          <p class="text-sm text-red-800">{error}</p>
        </div>
      {/if}
      
      <form class="space-y-4" onsubmit={handleSignup}>
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
            disabled={loading}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="johndoe"
          />
          <p class="mt-1 text-xs text-gray-500">
            3-20 characters, letters, numbers, dashes, underscores
          </p>
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
            disabled={loading}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="John Doe"
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
            disabled={loading}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p class="mt-1 text-xs text-gray-500">
            At least 8 characters
          </p>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      
      <p class="text-center text-sm text-gray-600">
        Already have an account? <a href="/login" class="text-blue-600 hover:text-blue-700">Sign in</a>
      </p>
    {/if}
  </div>
</div>
