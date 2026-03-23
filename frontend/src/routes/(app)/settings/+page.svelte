<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { themeStore, THEMES } from '$lib/stores/theme.svelte';
  import { authStore } from '$lib/stores/auth';
  import Avatar from '$lib/components/Avatar.svelte';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import QRCode from 'qrcode';

  // --- Change Password ---
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let changePwMessage = $state('');
  let changePwError = $state('');
  let changingPassword = $state(false);

  // --- Avatar ---
  let uploadingAvatar = $state(false);
  let avatarMessage = $state('');
  let avatarError = $state('');

  // QR login
  let qrDataUrl = $state('');
  let qrLoading = $state(false);
  let qrError = $state('');
  let qrRefreshTimer: ReturnType<typeof setInterval> | null = null;

  async function generateQR() {
    qrLoading = true;
    qrError = '';
    try {
      const { token } = await api<{ token: string }>('POST', '/api/auth/transfer-token');
      const url = `${window.location.origin}/auth/transfer/${token}`;
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (e: any) {
      qrError = 'Failed to generate QR code';
    } finally {
      qrLoading = false;
    }
  }

  function startQRRefresh() {
    generateQR();
    qrRefreshTimer = setInterval(generateQR, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', handleQRVisibility);
  }

  function stopQRRefresh() {
    if (qrRefreshTimer) clearInterval(qrRefreshTimer);
    document.removeEventListener('visibilitychange', handleQRVisibility);
  }

  function handleQRVisibility() {
    if (document.hidden) {
      if (qrRefreshTimer) clearInterval(qrRefreshTimer);
      qrRefreshTimer = null;
    } else {
      generateQR();
      qrRefreshTimer = setInterval(generateQR, 4 * 60 * 1000);
    }
  }

  function autoHide(setter: (v: string) => void, delay = 3000) {
    setTimeout(() => setter(''), delay);
  }

  // --- Change Password ---
  async function changePassword() {
    changePwError = '';
    changePwMessage = '';
    if (newPassword !== confirmPassword) {
      changePwError = 'passwords do not match';
      autoHide((v) => (changePwError = v));
      return;
    }
    changingPassword = true;
    try {
      await api('POST', '/api/account/password', { currentPassword, newPassword });
      changePwMessage = 'password changed';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      autoHide((v) => (changePwMessage = v));
    } catch (err: unknown) {
      changePwError = err instanceof Error ? err.message : 'failed to change password';
      autoHide((v) => (changePwError = v));
    } finally {
      changingPassword = false;
    }
  }

  // --- Avatar ---
  async function handleAvatarUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      avatarError = 'Image must be less than 5MB';
      autoHide((v) => (avatarError = v));
      return;
    }
    uploadingAvatar = true;
    avatarError = '';
    avatarMessage = '';
    try {
      await authStore.updateAvatar(file);
      avatarMessage = 'Profile picture updated';
      input.value = '';
      autoHide((v) => (avatarMessage = v));
    } catch (err: unknown) {
      avatarError = err instanceof Error ? err.message : 'Failed to upload';
      autoHide((v) => (avatarError = v));
    } finally {
      uploadingAvatar = false;
    }
  }

  async function handleAvatarRemove() {
    try {
      await authStore.removeAvatar();
      avatarMessage = 'Profile picture removed';
      autoHide((v) => (avatarMessage = v));
    } catch (err: unknown) {
      avatarError = err instanceof Error ? err.message : 'Failed to remove';
      autoHide((v) => (avatarError = v));
    }
  }

  // --- Init ---
  onMount(() => {
    startQRRefresh();
  });

  onDestroy(() => { stopQRRefresh(); });
</script>

<div id="admin-page" class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center px-5 py-3 border-b shrink-0" style="border-color: var(--border);">
    <button id="close-admin" onclick={() => goto('/channels')} class="mr-3 hover:opacity-70" style="color: var(--rc-timestamp);" aria-label="Back">
      <ChevronLeft size={16} />
    </button>
    <span class="text-[13px] font-bold" style="color: var(--foreground);">settings</span>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-5">
    <div class="max-w-2xl mx-auto space-y-5">

      <!-- Theme -->
      <div class="border p-4" style="border-color: var(--border);">
        <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">theme</h3>
        <div class="flex gap-3 flex-wrap">
          {#each THEMES as theme (theme.id)}
            <button
              onclick={() => themeStore.set(theme.id)}
              class="border-2 p-3 min-w-[100px] text-left cursor-pointer"
              style="background: {theme.colors.bg}; border-color: {themeStore.current === theme.id ? theme.colors.accent : 'transparent'};"
            >
              <div class="text-[12px] font-bold font-mono" style="color: {theme.colors.fg};">{theme.name}</div>
              <div class="flex gap-1 mt-2">
                <span class="w-4 h-4 rounded-full border" style="background: {theme.colors.bg}; border-color: {theme.colors.fg};"></span>
                <span class="w-4 h-4 rounded-full" style="background: {theme.colors.fg};"></span>
                <span class="w-4 h-4 rounded-full" style="background: {theme.colors.accent};"></span>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Account -->
      <div class="border p-4" style="border-color: var(--border);">
        <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">account</h3>
        <div class="space-y-1 mb-3">
          <div class="flex items-center gap-2">
            <span class="text-[12px]" style="color: var(--rc-timestamp);">username:</span>
            <span class="text-[12px]" style="color: var(--foreground);">@{authStore.user?.username}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[12px]" style="color: var(--rc-timestamp);">display name:</span>
            <span class="text-[12px]" style="color: var(--foreground);">{authStore.user?.displayName}</span>
          </div>
        </div>
        <!-- Profile Picture -->
        <div class="flex items-center gap-3 mt-3">
          <Avatar url={authStore.user?.avatarUrl} displayName={authStore.user?.displayName || '?'} username={authStore.user?.username} size={48} />
          <div class="flex flex-col gap-1">
            <label class="text-[11px] hover:underline underline-offset-2 cursor-pointer" style="color: var(--rc-olive);">
              {uploadingAvatar ? 'uploading...' : 'change picture'}
              <input type="file" accept="image/*" onchange={handleAvatarUpload} disabled={uploadingAvatar} class="hidden" />
            </label>
            {#if authStore.user?.avatarUrl}
              <button onclick={handleAvatarRemove} class="text-[11px] text-left hover:underline underline-offset-2"
                      style="color: var(--rc-mention-badge);">remove</button>
            {/if}
          </div>
        </div>
        {#if avatarMessage}<p class="text-[11px] mt-2" style="color: var(--rc-olive);">{avatarMessage}</p>{/if}
        {#if avatarError}<p class="text-[11px] mt-2" style="color: var(--rc-mention-badge);">{avatarError}</p>{/if}
        <button id="logout" onclick={() => { authStore.logout(); goto('/login'); }}
                class="text-[11px] hover:underline underline-offset-2 mt-3"
                style="color: var(--rc-mention-badge);">logout</button>
        <!-- Change Password -->
        <div class="mt-4 pt-3 border-t" style="border-color: var(--border);">
          <h4 class="text-[12px] font-bold mb-2" style="color: var(--foreground);">change password</h4>
          <div class="space-y-2 max-w-xs">
            <input type="password" bind:value={currentPassword} placeholder="current password"
                   class="w-full border px-3 py-1.5 text-[12px] font-mono outline-none"
                   style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
            <input type="password" bind:value={newPassword} placeholder="new password"
                   class="w-full border px-3 py-1.5 text-[12px] font-mono outline-none"
                   style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
            <input type="password" bind:value={confirmPassword} placeholder="confirm new password"
                   class="w-full border px-3 py-1.5 text-[12px] font-mono outline-none"
                   style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
          </div>
          {#if changePwMessage}<p class="text-[11px] mt-2" style="color: var(--rc-olive);">{changePwMessage}</p>{/if}
          {#if changePwError}<p class="text-[11px] mt-2" style="color: var(--rc-mention-badge);">{changePwError}</p>{/if}
          <button onclick={changePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  class="mt-2 px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                  style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
            {changingPassword ? 'saving...' : 'change password'}</button>
        </div>
      </div>

      <!-- QR Login -->
      <div class="border p-4" style="border-color: var(--border);">
        <div class="border-t pt-4 mt-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-1">log in on another device</h3>
          <p class="text-[11px] mb-3" style="color: var(--rc-timestamp);">scan this QR code with your phone to log in instantly</p>
          {#if qrLoading && !qrDataUrl}
            <div class="w-[200px] h-[200px] border flex items-center justify-center"
                 style="border-color: var(--border);">
              <span class="text-[11px]" style="color: var(--rc-timestamp);">generating...</span>
            </div>
          {:else if qrError}
            <p class="text-[11px]" style="color: var(--rc-mention-badge);">{qrError}</p>
          {:else if qrDataUrl}
            <img src={qrDataUrl} alt="QR code for mobile login" class="w-[200px] h-[200px]" />
            {#if qrLoading}
              <p class="text-[10px] mt-1" style="color: var(--rc-timestamp);">refreshing...</p>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Admin Settings link -->
      {#if authStore.isAdmin}
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-2" style="color: var(--foreground);">administration</h3>
          <p class="text-[11px] mb-3" style="color: var(--rc-timestamp);">
            manage branding, invites, bots, users, and notification relay settings.
          </p>
          <a href="/settings/admin"
             class="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] border font-mono hover:opacity-80"
             style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
            admin settings →
          </a>
        </div>
      {/if}

    </div>
  </div>
</div>
