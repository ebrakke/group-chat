<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let activeTab = $state<'login' | 'signup'>('login');

  // Login form fields
  let loginUsername = $state('');
  let loginPassword = $state('');
  let loginError = $state('');
  let loginSubmitting = $state(false);

  // Signup form fields
  let signupUsername = $state('');
  let signupDisplayName = $state('');
  let signupPassword = $state('');
  let signupInviteCode = $state('');
  let signupError = $state('');
  let signupSubmitting = $state(false);

  // Check URL for invite code param
  $effect(() => {
    const code = $page.url.searchParams.get('code');
    if (code) {
      signupInviteCode = code;
      activeTab = 'signup';
    }
  });

  async function handleLogin(e: Event) {
    e.preventDefault();
    loginError = '';
    loginSubmitting = true;
    try {
      await authStore.login(loginUsername, loginPassword);
      goto('/channels');
    } catch (err: any) {
      loginError = err.message || 'Login failed';
    } finally {
      loginSubmitting = false;
    }
  }

  async function handleSignup(e: Event) {
    e.preventDefault();
    signupError = '';
    signupSubmitting = true;
    try {
      await authStore.signup(signupUsername, signupPassword, signupDisplayName, signupInviteCode);
      goto('/channels');
    } catch (err: any) {
      signupError = err.message || 'Signup failed';
    } finally {
      signupSubmitting = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-950 text-gray-100">
  <div class="w-full max-w-md p-8">
    <h1 class="text-3xl font-bold text-center mb-8">Relay Chat</h1>

    <div class="flex mb-6 border-b border-gray-700">
      <button
        data-tab="login"
        onclick={() => (activeTab = 'login')}
        class="flex-1 py-2 text-center font-medium transition-colors {activeTab === 'login'
          ? 'text-blue-400 border-b-2 border-blue-400'
          : 'text-gray-400 hover:text-gray-200'}"
      >
        Login
      </button>
      <button
        data-tab="signup"
        onclick={() => (activeTab = 'signup')}
        class="flex-1 py-2 text-center font-medium transition-colors {activeTab === 'signup'
          ? 'text-blue-400 border-b-2 border-blue-400'
          : 'text-gray-400 hover:text-gray-200'}"
      >
        Sign Up
      </button>
    </div>

    {#if activeTab === 'login'}
      <form id="login-card" onsubmit={handleLogin} class="space-y-4">
        {#if loginError}
          <div class="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
            {loginError}
          </div>
        {/if}

        <div>
          <label for="username" class="block text-sm font-medium text-gray-300 mb-1">Username</label>
          <input
            id="username"
            type="text"
            bind:value={loginUsername}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Username"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            id="password"
            type="password"
            bind:value={loginPassword}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Password"
          />
        </div>

        <button
          id="submit"
          type="submit"
          disabled={loginSubmitting}
          class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
        >
          {loginSubmitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    {:else}
      <form id="signup-card" onsubmit={handleSignup} class="space-y-4">
        {#if signupError}
          <div class="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
            {signupError}
          </div>
        {/if}

        <div>
          <label for="username" class="block text-sm font-medium text-gray-300 mb-1">Username</label>
          <input
            id="username"
            type="text"
            bind:value={signupUsername}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Username"
          />
        </div>

        <div>
          <label for="display-name" class="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
          <input
            id="display-name"
            type="text"
            bind:value={signupDisplayName}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Display Name"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            id="password"
            type="password"
            bind:value={signupPassword}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Password"
          />
        </div>

        <div>
          <label for="invite-code" class="block text-sm font-medium text-gray-300 mb-1">Invite Code</label>
          <input
            id="invite-code"
            type="text"
            bind:value={signupInviteCode}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter invite code"
          />
        </div>

        <button
          id="submit"
          type="submit"
          disabled={signupSubmitting}
          class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
        >
          {signupSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    {/if}
  </div>
</div>
