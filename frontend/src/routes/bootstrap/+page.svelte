<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await authStore.bootstrap(username, password, displayName);
      goto('/welcome');
    } catch (err: any) {
      error = err.message || 'Bootstrap failed';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen font-mono"
     style="background: var(--background); color: var(--foreground);">
  <div class="w-full max-w-sm p-8">
    <div class="mb-2 text-center">
      <span class="text-[18px] font-bold tracking-tight">relay</span><span class="text-[18px]" style="color: var(--rc-timestamp);">.chat</span>
    </div>
    <p class="text-[12px] text-center mb-8" style="color: var(--rc-timestamp);">create your admin account to get started</p>

    <form onsubmit={handleSubmit} class="space-y-4">
      {#if error}
        <div class="border px-3 py-2 text-[12px]"
             style="border-color: var(--rc-mention-badge); color: var(--rc-mention-badge);">
          {error}
        </div>
      {/if}

      <div>
        <label for="username" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          required
          class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
          style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          placeholder="admin"
        />
      </div>

      <div>
        <label for="displayName" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">display name</label>
        <input
          id="displayName"
          type="text"
          bind:value={displayName}
          required
          class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
          style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          placeholder="Admin User"
        />
      </div>

      <div>
        <label for="password" class="block text-[12px] mb-1" style="color: var(--rc-timestamp);">password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          class="w-full px-3 py-2 border text-[13px] font-mono outline-none"
          style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          placeholder="enter a strong password"
        />
      </div>

      <button
        id="submit"
        type="submit"
        disabled={submitting}
        class="w-full py-2 px-4 text-[12px] font-mono border disabled:opacity-40 transition-colors"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
      >{submitting ? 'creating...' : 'create admin account'}</button>
    </form>
  </div>
</div>
