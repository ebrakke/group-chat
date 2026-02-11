<script lang="ts">
  import { goto } from '$app/navigation';
  
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  
  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    
    error = '';
    loading = true;
    
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        error = data.error || 'Login failed';
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
    <div class="text-center">
      <h1 class="text-3xl font-bold text-gray-900">Relay Chat</h1>
      <p class="mt-2 text-sm text-gray-600">Sign in to your account</p>
    </div>
    
    {#if error}
      <div class="rounded-md bg-red-50 p-4">
        <p class="text-sm text-red-800">{error}</p>
      </div>
    {/if}
    
    <form class="space-y-4" onsubmit={handleLogin}>
      <div>
        <label for="username" class="block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="username"
          type="text"
          bind:value={username}
          required
          disabled={loading}
          class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          disabled={loading}
          class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      
      <button
        type="submit"
        disabled={loading}
        class="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
    
    <p class="text-center text-sm text-gray-600">
      First time here? Visit the main page to sign up.
    </p>
  </div>
</div>
