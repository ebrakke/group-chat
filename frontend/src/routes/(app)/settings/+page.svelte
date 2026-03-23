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

  // --- ntfy ---
  interface NtfyTopicResponse {
    topic: string;
    serverUrl: string;
    enabled: boolean;
  }
  let ntfyEnabled = $state(false);
  let ntfyTopic = $state('');
  let ntfyServerUrl = $state('');
  let ntfyModalOpen = $state(false);
  let ntfyTopicExpanded = $state(false);
  let ntfyRegenerating = $state(false);
  let copiedField = $state<'server' | 'topic' | null>(null);

  // --- Test notification ---
  let testState = $state<'idle' | 'sending' | 'success' | 'timeout'>('idle');
  let testTimer: ReturnType<typeof setTimeout> | null = null;
  let testBroadcastChannel: BroadcastChannel | null = null;

  // --- Platform detection ---
  function detectPlatform(): 'android' | 'ios' | 'desktop' {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad/i.test(ua)) return 'ios';
    return 'desktop';
  }

  const platform = $derived(detectPlatform());

  function ntfyDeepLink(): string {
    try {
      const url = new URL(ntfyServerUrl);
      return `ntfy://${url.host}/${ntfyTopic}`;
    } catch {
      return `ntfy://${ntfyServerUrl}/${ntfyTopic}`;
    }
  }

  async function copyToClipboard(text: string, field: 'server' | 'topic') {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = field;
      toastStore.success('Copied!');
      setTimeout(() => { copiedField = null; }, 2000);
    } catch {
      toastStore.error('Failed to copy');
    }
  }

  async function regenerateTopic() {
    ntfyRegenerating = true;
    try {
      const res = await api<{ topic: string }>('POST', '/api/push/ntfy-topic/regenerate');
      ntfyTopic = res.topic;
    } catch (e: unknown) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to regenerate topic');
    } finally {
      ntfyRegenerating = false;
    }
  }

  async function sendTestNotification() {
    if (testState === 'sending') return;
    testState = 'sending';

    // Clean up any previous channel
    if (testBroadcastChannel) {
      testBroadcastChannel.close();
      testBroadcastChannel = null;
    }
    if (testTimer) {
      clearTimeout(testTimer);
      testTimer = null;
    }

    const bc = new BroadcastChannel('push-test');
    testBroadcastChannel = bc;

    bc.onmessage = () => {
      testState = 'success';
      if (testTimer) clearTimeout(testTimer);
      bc.close();
      testBroadcastChannel = null;
    };

    testTimer = setTimeout(() => {
      testState = 'timeout';
      bc.close();
      testBroadcastChannel = null;
    }, 10000);

    try {
      await api('POST', '/api/push/test');
    } catch (e: unknown) {
      testState = 'idle';
      if (testTimer) clearTimeout(testTimer);
      bc.close();
      testBroadcastChannel = null;
      toastStore.error(e instanceof Error ? e.message : 'Failed to send test notification');
    }
  }

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
  onMount(async () => {
    startQRRefresh();
    try {
      const res = await api<NtfyTopicResponse>('GET', '/api/push/ntfy-topic');
      ntfyEnabled = res.enabled;
      ntfyTopic = res.topic;
      ntfyServerUrl = res.serverUrl;
    } catch {
      // ntfy not configured — section stays hidden
    }
  });

  onDestroy(() => {
    stopQRRefresh();
    if (testBroadcastChannel) testBroadcastChannel.close();
    if (testTimer) clearTimeout(testTimer);
  });
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

      <!-- Reliable Notifications (ntfy) -->
      {#if ntfyEnabled}
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-1" style="color: var(--foreground);">reliable notifications</h3>
          <p class="text-[11px] mb-3" style="color: var(--rc-timestamp);">
            Get notifications even when the app is closed. Requires the free ntfy app.
          </p>
          <div class="flex gap-2 flex-wrap">
            <button
              onclick={() => (ntfyModalOpen = true)}
              class="px-3 py-1.5 text-[11px] border font-mono hover:opacity-80"
              style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
            >
              set up ntfy
            </button>
            <button
              onclick={regenerateTopic}
              disabled={ntfyRegenerating}
              class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40 hover:opacity-80"
              style="border-color: var(--border); color: var(--rc-timestamp);"
            >
              {ntfyRegenerating ? 'regenerating...' : 'regenerate topic'}
            </button>
          </div>

          <!-- Collapsible topic debug -->
          <div class="mt-3">
            <button
              onclick={() => (ntfyTopicExpanded = !ntfyTopicExpanded)}
              class="text-[10px] hover:opacity-70"
              style="color: var(--rc-timestamp);"
            >
              {ntfyTopicExpanded ? '▾' : '▸'} current topic
            </button>
            {#if ntfyTopicExpanded}
              <p class="text-[11px] mt-1 font-mono break-all" style="color: var(--foreground);">{ntfyTopic}</p>
            {/if}
          </div>
        </div>

        <!-- ntfy setup modal -->
        {#if ntfyModalOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="fixed inset-0 z-50 flex items-center justify-center p-4"
            style="background: rgba(0,0,0,0.5);"
            onclick={(e) => { if (e.target === e.currentTarget) ntfyModalOpen = false; }}
          >
            <div class="border p-5 max-w-sm w-full space-y-4" style="background: var(--background); border-color: var(--border);">
              <div class="flex items-center justify-between">
                <h3 class="text-[13px] font-bold" style="color: var(--foreground);">set up ntfy</h3>
                <button onclick={() => (ntfyModalOpen = false)} class="text-[12px] hover:opacity-70" style="color: var(--rc-timestamp);">✕</button>
              </div>

              {#if platform === 'android'}
                <div class="space-y-3">
                  <a
                    href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center w-full px-3 py-2 text-[11px] border font-mono hover:opacity-80"
                    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
                  >
                    install ntfy (Play Store)
                  </a>
                  <a
                    href={ntfyDeepLink()}
                    class="flex items-center justify-center w-full px-3 py-2 text-[11px] border font-mono hover:opacity-80"
                    style="border-color: var(--border); color: var(--foreground);"
                  >
                    open in ntfy
                  </a>
                  <p class="text-[11px]" style="color: var(--rc-timestamp);">
                    You're all set! ntfy will handle your notifications. You can disable browser push to avoid duplicates.
                  </p>
                </div>

              {:else if platform === 'ios'}
                <div class="space-y-3">
                  <div class="space-y-2">
                    <p class="text-[11px] font-bold" style="color: var(--foreground);">1. Install ntfy from the App Store</p>
                    <a
                      href="https://apps.apple.com/app/ntfy/id1625396347"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-block px-3 py-1.5 text-[11px] border font-mono hover:opacity-80"
                      style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
                    >
                      open App Store
                    </a>
                  </div>
                  <div class="space-y-2">
                    <p class="text-[11px] font-bold" style="color: var(--foreground);">2. Open ntfy → tap + → enter this server:</p>
                    <button
                      onclick={() => copyToClipboard(ntfyServerUrl, 'server')}
                      class="w-full text-left px-3 py-2 border font-mono text-[11px] hover:opacity-80 break-all"
                      style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
                    >
                      {ntfyServerUrl}
                      <span class="ml-1 text-[10px]" style="color: var(--rc-timestamp);">
                        {copiedField === 'server' ? '✓ copied' : 'tap to copy'}
                      </span>
                    </button>
                  </div>
                  <div class="space-y-2">
                    <p class="text-[11px] font-bold" style="color: var(--foreground);">3. Enter this topic:</p>
                    <button
                      onclick={() => copyToClipboard(ntfyTopic, 'topic')}
                      class="w-full text-left px-3 py-2 border font-mono text-[11px] hover:opacity-80 break-all"
                      style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
                    >
                      {ntfyTopic}
                      <span class="ml-1 text-[10px]" style="color: var(--rc-timestamp);">
                        {copiedField === 'topic' ? '✓ copied' : 'tap to copy'}
                      </span>
                    </button>
                  </div>
                </div>

              {:else}
                <p class="text-[11px]" style="color: var(--rc-timestamp);">
                  On desktop, notifications work best when your browser stays running.
                </p>
              {/if}
            </div>
          </div>
        {/if}
      {/if}

      <!-- Test Notification -->
      <div class="border p-4" style="border-color: var(--border);">
        <h3 class="text-[13px] font-bold mb-1" style="color: var(--foreground);">test notification</h3>
        <p class="text-[11px] mb-3" style="color: var(--rc-timestamp);">Send a test push notification to verify delivery.</p>
        <button
          onclick={sendTestNotification}
          disabled={testState === 'sending'}
          class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40 hover:opacity-80"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >
          {#if testState === 'sending'}
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style="border-color: var(--rc-channel-active-fg); border-top-color: transparent;"></span>
              sending...
            </span>
          {:else}
            send test notification
          {/if}
        </button>

        {#if testState === 'success'}
          <p class="text-[11px] mt-2 flex items-center gap-1" style="color: var(--rc-olive);">
            <span>✓</span> Notification received!
          </p>
        {:else if testState === 'timeout'}
          <div class="mt-2">
            <p class="text-[11px]" style="color: var(--rc-mention-badge);">Notification not received within 10 seconds.</p>
            <p class="text-[11px] mt-1" style="color: var(--rc-timestamp);">
              {#if platform === 'android'}
                Check that Chrome is not battery-optimized in your device settings.
              {:else if platform === 'ios'}
                Make sure this app is added to your home screen.
              {:else}
                Notifications require your browser to be running.
              {/if}
            </p>
            <button
              onclick={() => (testState = 'idle')}
              class="mt-1 text-[10px] hover:opacity-70 hover:underline"
              style="color: var(--rc-timestamp);"
            >
              dismiss
            </button>
          </div>
        {/if}
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
