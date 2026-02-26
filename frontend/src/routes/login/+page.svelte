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
  let inviteCodeReadonly = $state(false);
  let signupError = $state('');
  let signupSubmitting = $state(false);

  // Check URL for invite code param
  $effect(() => {
    const code = $page.url.searchParams.get('code');
    if (code) {
      signupInviteCode = code;
      inviteCodeReadonly = true;
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

<div class="flex items-center justify-center min-h-screen font-mono"
     style="background: var(--background); color: var(--foreground);">
  <div class="w-full max-w-sm p-8">
    <div class="mb-8 text-center">
      <span class="text-[18px] font-bold tracking-tight">relay</span><span class="text-[18px]" style="color: var(--rc-timestamp);">.chat</span>
    </div>

    <div class="flex mb-6 border-b" style="border-color: var(--border);">
      <button
        data-tab="login"
        onclick={() => (activeTab = 'login')}
        class="auth-tab flex-1 py-2 text-center text-[13px] transition-colors {activeTab === 'login'
          ? 'active font-bold border-b-2'
          : ''}"
        style="{activeTab === 'login' ? 'border-color: var(--foreground); color: var(--foreground);' : 'color: var(--rc-timestamp);'}"
      >Login</button>
      <button
        data-tab="signup"
        onclick={() => (activeTab = 'signup')}
        class="auth-tab flex-1 py-2 text-center text-[13px] transition-colors {activeTab === 'signup'
          ? 'active font-bold border-b-2'
          : ''}"
        style="{activeTab === 'signup' ? 'border-color: var(--foreground); color: var(--foreground);' : 'color: var(--rc-timestamp);'}"
      >Sign Up</button>
    </div>

    {#if activeTab === 'login'}
      <form id="login-card" onsubmit={handleLogin} class="space-y-4">
        {#if loginError}
          <div class="border px-3 py-2 text-[12px]"
               style="border-color: var(--rc-mention-badge); color: var(--rc-mention-badge);">
            {loginError}
          </div>
        {/if}

        <div>
          <label for="username" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">username</label>
          <input
            id="username"
            type="text"
            bind:value={loginUsername}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="username"
          />
        </div>

        <div>
          <label for="password" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">password</label>
          <input
            id="password"
            type="password"
            bind:value={loginPassword}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="password"
          />
        </div>

        <button
          id="submit"
          type="submit"
          disabled={loginSubmitting}
          class="w-full py-2 px-4 text-[12px] font-mono border disabled:opacity-40 transition-colors"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >{loginSubmitting ? 'logging in...' : 'log in'}</button>
      </form>
    {:else}
      <form id="signup-card" onsubmit={handleSignup} class="space-y-4">
        {#if signupError}
          <div class="border px-3 py-2 text-[12px]"
               style="border-color: var(--rc-mention-badge); color: var(--rc-mention-badge);">
            {signupError}
          </div>
        {/if}

        <div>
          <label for="signup-username" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">username</label>
          <input
            id="signup-username"
            type="text"
            bind:value={signupUsername}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="username"
          />
        </div>

        <div>
          <label for="signup-display" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">display name</label>
          <input
            id="signup-display"
            type="text"
            bind:value={signupDisplayName}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="display name"
          />
        </div>

        <div>
          <label for="signup-password" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">password</label>
          <input
            id="signup-password"
            type="password"
            bind:value={signupPassword}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="password"
          />
        </div>

        <div>
          <label for="invite-code" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">invite code</label>
          <input
            id="invite-code"
            type="text"
            bind:value={signupInviteCode}
            readonly={inviteCodeReadonly}
            required
            class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            placeholder="enter invite code"
          />
        </div>

        <button
          id="signup-submit"
          type="submit"
          disabled={signupSubmitting}
          class="w-full py-2 px-4 text-[12px] font-mono border disabled:opacity-40 transition-colors"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >{signupSubmitting ? 'creating account...' : 'create account'}</button>
      </form>
    {/if}
  </div>
</div>
