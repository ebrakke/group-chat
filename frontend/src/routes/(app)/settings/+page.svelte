<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { authStore } from '$lib/stores/auth';
  import { channelStore } from '$lib/stores/channels';
  import type { Bot, BotToken, ChannelBinding, Invite, Channel, User } from '$lib/types';

  // --- Change Password ---
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let changePwMessage = $state('');
  let changePwError = $state('');
  let changingPassword = $state(false);

  // --- Users (admin) ---
  let users = $state<User[]>([]);
  let resetPasswordResult = $state('');
  let resetPasswordUser = $state('');
  let resettingPasswordId = $state<number | null>(null);

  // --- Admin Settings ---
  let baseUrl = $state('');
  let baseUrlMessage = $state('');
  let baseUrlError = $state('');
  let savingBaseUrl = $state(false);

  // --- Invites ---
  let invites = $state<Invite[]>([]);
  let inviteResult = $state('');
  let creatingInvite = $state(false);

  // --- Bots ---
  let bots = $state<Bot[]>([]);
  let showCreateBotModal = $state(false);
  let newBotUsername = $state('');
  let newBotDisplayName = $state('');
  let creatingBot = $state(false);
  let createBotError = $state('');

  // --- Manage Bot Modal ---
  let managingBot = $state<Bot | null>(null);
  let botTokens = $state<BotToken[]>([]);
  let botBindings = $state<ChannelBinding[]>([]);
  let newTokenLabel = $state('');
  let generatingToken = $state(false);
  let generatedToken = $state('');
  let showTokenModal = $state(false);
  let bindChannelId = $state<number | null>(null);

  // --- Delete Bot Confirm ---
  let confirmDeleteBot = $state<Bot | null>(null);
  let deletingBot = $state(false);

  function autoHide(setter: (v: string) => void, delay = 3000) {
    setTimeout(() => setter(''), delay);
  }

  // --- Admin settings ---
  async function loadAdminSettings() {
    try {
      const settings = await api<{ baseUrl?: string; ntfyServerUrl?: string }>(
        'GET',
        '/api/admin/settings'
      );
      baseUrl = settings.baseUrl || '';
    } catch {
      toastStore.error('Failed to load settings');
    }
  }

  async function saveBaseUrl() {
    savingBaseUrl = true;
    baseUrlError = '';
    baseUrlMessage = '';
    try {
      await api('POST', '/api/admin/settings', { base_url: baseUrl });
      baseUrlMessage = 'Base URL saved';
      autoHide((v) => (baseUrlMessage = v));
    } catch (err: unknown) {
      baseUrlError = err instanceof Error ? err.message : 'Failed to save';
      autoHide((v) => (baseUrlError = v));
    } finally {
      savingBaseUrl = false;
    }
  }

  // --- Invites ---
  async function loadInvites() {
    try {
      invites = await api<Invite[]>('GET', '/api/invites');
    } catch {
      toastStore.error('Failed to load invites');
    }
  }

  async function createInvite() {
    creatingInvite = true;
    try {
      const result = await api<{ code: string }>('POST', '/api/invites');
      inviteResult = `${window.location.origin}/invite/${result.code}`;
      await loadInvites();
    } catch {
      toastStore.error('Failed to create invite');
    } finally {
      creatingInvite = false;
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
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

  // --- Users (admin) ---
  async function loadUsers() {
    try {
      users = await api<User[]>('GET', '/api/users');
    } catch {
      toastStore.error('Failed to load users');
    }
  }

  function generateTempPassword(): string {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => chars[b % chars.length]).join('');
  }

  async function resetPassword(user: User) {
    resettingPasswordId = user.id;
    try {
      const tempPassword = generateTempPassword();
      await api('POST', `/api/users/${user.id}/reset-password`, { password: tempPassword });
      resetPasswordResult = tempPassword;
      resetPasswordUser = user.displayName;
    } catch {
      toastStore.error('Failed to reset password');
    } finally {
      resettingPasswordId = null;
    }
  }

  // --- Bots ---
  async function loadBots() {
    try {
      bots = await api<Bot[]>('GET', '/api/bots');
    } catch {
      toastStore.error('Failed to load bots');
    }
  }

  async function createBot() {
    creatingBot = true;
    createBotError = '';
    try {
      await api('POST', '/api/bots', {
        username: newBotUsername,
        displayName: newBotDisplayName
      });
      showCreateBotModal = false;
      newBotUsername = '';
      newBotDisplayName = '';
      await loadBots();
    } catch (err: unknown) {
      createBotError = err instanceof Error ? err.message : 'Failed to create bot';
    } finally {
      creatingBot = false;
    }
  }

  async function deleteBot(bot: Bot) {
    deletingBot = true;
    try {
      await api('DELETE', `/api/bots/${bot.id}`);
      confirmDeleteBot = null;
      if (managingBot?.id === bot.id) managingBot = null;
      await loadBots();
    } catch {
      toastStore.error('Failed to delete bot');
    } finally {
      deletingBot = false;
    }
  }

  async function openManageBot(bot: Bot) {
    managingBot = bot;
    await Promise.all([loadBotTokens(bot.id), loadBotBindings(bot.id)]);
  }

  async function loadBotTokens(botId: number) {
    try {
      botTokens = await api<BotToken[]>('GET', `/api/bots/${botId}/tokens`);
    } catch {
      botTokens = [];
    }
  }

  async function loadBotBindings(botId: number) {
    try {
      botBindings = await api<ChannelBinding[]>('GET', `/api/bots/${botId}/bindings`);
    } catch {
      botBindings = [];
    }
  }

  async function generateToken() {
    if (!managingBot) return;
    generatingToken = true;
    try {
      const result = await api<{ token: string }>('POST', `/api/bots/${managingBot.id}/tokens`, {
        label: newTokenLabel || undefined
      });
      generatedToken = result.token;
      showTokenModal = true;
      newTokenLabel = '';
      await loadBotTokens(managingBot.id);
    } catch {
      toastStore.error('Failed to generate token');
    } finally {
      generatingToken = false;
    }
  }

  async function revokeToken(tokenId: number) {
    try {
      await api('DELETE', `/api/bots/tokens/${tokenId}`);
      if (managingBot) await loadBotTokens(managingBot.id);
    } catch {
      toastStore.error('Failed to revoke token');
    }
  }

  async function bindChannel() {
    if (!managingBot || !bindChannelId) return;
    try {
      await api('POST', `/api/bots/${managingBot.id}/bindings`, {
        channelId: bindChannelId,
        canRead: true,
        canWrite: true
      });
      bindChannelId = null;
      await loadBotBindings(managingBot.id);
    } catch {
      toastStore.error('Failed to bind channel');
    }
  }

  async function unbindChannel(channelId: number) {
    if (!managingBot) return;
    try {
      await api('DELETE', `/api/bots/${managingBot.id}/bindings/${channelId}`);
      await loadBotBindings(managingBot.id);
    } catch {
      toastStore.error('Failed to unbind channel');
    }
  }

  let unboundChannels = $derived(
    channelStore.channels.filter(
      (c: Channel) => !botBindings.some((b: ChannelBinding) => b.channelId === c.id)
    )
  );

  function getChannelName(channelId: number): string {
    const ch = channelStore.channels.find((c: Channel) => c.id === channelId);
    return ch ? `#${ch.name}` : `Channel ${channelId}`;
  }

  function handleBotUsernameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    newBotUsername = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    input.value = newBotUsername;
  }

  // --- Init ---
  onMount(() => {
    if (authStore.isAdmin) {
      loadAdminSettings();
      loadInvites();
      loadUsers();
      loadBots();
    }
  });
</script>

<div id="admin-page" class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center px-5 py-3 border-b shrink-0" style="border-color: var(--border);">
    <button id="close-admin" onclick={() => goto('/channels')} class="mr-3 hover:opacity-70" style="color: var(--rc-timestamp);" aria-label="Back">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <span class="text-[13px] font-bold" style="color: var(--foreground);">settings</span>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-5">
    <div class="max-w-2xl mx-auto space-y-5">

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
        <button id="logout" onclick={() => { authStore.logout(); goto('/login'); }}
                class="text-[11px] hover:underline underline-offset-2"
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

      {#if authStore.isAdmin}

        <!-- General Settings -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">general settings</h3>
          <label class="block mb-3">
            <span class="text-[12px] mb-1 block" style="color: var(--rc-timestamp);">base URL</span>
            <input id="base-url" type="text" bind:value={baseUrl} placeholder="https://your-domain.com"
                   class="w-full border px-3 py-2 text-[12px] font-mono outline-none"
                   style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
          </label>
          {#if baseUrlMessage}<p class="text-[11px] mb-2" style="color: var(--rc-olive);">{baseUrlMessage}</p>{/if}
          {#if baseUrlError}<p class="text-[11px] mb-2" style="color: var(--rc-mention-badge);">{baseUrlError}</p>{/if}
          <button id="save-base-url" onclick={saveBaseUrl} disabled={savingBaseUrl}
                  class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                  style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
            {savingBaseUrl ? 'saving...' : 'save'}</button>
        </div>

        <!-- Invites -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">invites</h3>
          <span id="admin-create-invite">
            <button id="create-invite" onclick={createInvite} disabled={creatingInvite}
                    class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
              {creatingInvite ? 'creating...' : 'create invite'}</button>
          </span>
          {#if inviteResult}
            <div id="invite-result" class="mt-3 p-3 border" style="border-color: var(--border);">
              <div id="admin-invite-result">
                <p class="text-[11px] mb-1" style="color: var(--rc-timestamp);">invite link:</p>
                <div class="flex items-center gap-2">
                  <code class="invite-code text-[12px] break-all flex-1" style="color: var(--rc-olive);">{inviteResult}</code>
                  <button onclick={() => copyToClipboard(inviteResult)}
                          class="copy-link-btn shrink-0 px-2 py-1 text-[11px] border hover:opacity-70"
                          style="border-color: var(--border); color: var(--rc-timestamp);">copy</button>
                </div>
              </div>
            </div>
          {/if}
          {#if invites.length > 0}
            <div class="mt-4 space-y-2">
              <h4 class="text-[12px]" style="color: var(--rc-timestamp);">existing invites</h4>
              {#each invites as invite (invite.code)}
                <div class="flex items-center justify-between p-2 border" style="border-color: var(--border);">
                  <div class="min-w-0 flex-1">
                    <code class="text-[11px] break-all" style="color: var(--foreground);">{invite.code}</code>
                    <p class="text-[11px] mt-0.5" style="color: var(--rc-timestamp);">
                      used {invite.useCount} time{invite.useCount !== 1 ? 's' : ''}
                      {#if invite.maxUses}/ {invite.maxUses} max{/if}
                    </p>
                  </div>
                  <button onclick={() => copyToClipboard(`${window.location.origin}/invite/${invite.code}`)}
                          class="shrink-0 ml-2 px-2 py-1 text-[11px] border hover:opacity-70"
                          style="border-color: var(--border); color: var(--rc-timestamp);">copy</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Users -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">users</h3>
          {#each users.filter((u) => !u.isBot) as user (user.id)}
            <div class="flex items-center justify-between p-2 border mb-2" style="border-color: var(--border);">
              <div class="min-w-0 flex-1">
                <span class="text-[12px] font-bold" style="color: var(--foreground);">{user.displayName}</span>
                <span class="text-[11px] ml-1" style="color: var(--rc-timestamp);">@{user.username}</span>
                {#if user.role === 'admin'}
                  <span class="text-[9px] font-bold uppercase tracking-wide px-1 py-[1px] ml-1"
                        style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">admin</span>
                {/if}
              </div>
              {#if user.id !== authStore.user?.id}
                <button onclick={() => resetPassword(user)}
                        disabled={resettingPasswordId === user.id}
                        class="shrink-0 ml-2 px-2 py-1 text-[11px] border hover:opacity-70 disabled:opacity-40"
                        style="border-color: var(--border); color: var(--rc-timestamp);">
                  {resettingPasswordId === user.id ? '...' : 'reset password'}</button>
              {/if}
            </div>
          {:else}
            <p class="text-[12px]" style="color: var(--rc-timestamp);">no users yet.</p>
          {/each}
        </div>

        <!-- Bots -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[13px] font-bold mb-3" style="color: var(--foreground);">bots</h3>
          <button onclick={() => { showCreateBotModal = true; newBotUsername = ''; newBotDisplayName = ''; createBotError = ''; }}
                  class="px-3 py-1.5 text-[11px] border font-mono"
                  style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
            create bot</button>
          {#if bots.length > 0}
            <div class="mt-4 space-y-2">
              {#each bots as bot (bot.id)}
                <div class="flex items-center justify-between p-3 border" style="border-color: var(--border);">
                  <div>
                    <p class="text-[12px] font-bold" style="color: var(--foreground);">{bot.displayName}</p>
                    <p class="text-[11px]" style="color: var(--rc-timestamp);">@{bot.username}</p>
                  </div>
                  <div class="flex gap-2">
                    <button onclick={() => openManageBot(bot)}
                            class="px-2 py-1 text-[11px] border hover:opacity-70"
                            style="border-color: var(--border); color: var(--rc-timestamp);">manage</button>
                    <button onclick={() => (confirmDeleteBot = bot)}
                            class="px-2 py-1 text-[11px] hover:underline"
                            style="color: var(--rc-mention-badge);">delete</button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[12px] mt-3" style="color: var(--rc-timestamp);">no bots created yet.</p>
          {/if}
        </div>

      {/if}
    </div>
  </div>
</div>

<!-- Create Bot Modal -->
{#if showCreateBotModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
       role="dialog" aria-modal="true" aria-label="Create bot" tabindex="-1"
       onkeydown={(e) => { if (e.key === 'Escape') showCreateBotModal = false; }}>
    <div class="p-6 w-full max-w-md mx-4 border" style="background: var(--background); border-color: var(--border);">
      <h2 class="text-[14px] font-bold mb-4" style="color: var(--foreground);">create bot</h2>
      {#if createBotError}<p class="text-[12px] mb-3" style="color: var(--rc-mention-badge);">{createBotError}</p>{/if}
      <label class="block mb-3">
        <span class="text-[12px] mb-1 block" style="color: var(--rc-timestamp);">username</span>
        <input type="text" value={newBotUsername} oninput={handleBotUsernameInput} placeholder="my-bot"
               class="w-full border px-3 py-2 text-[12px] font-mono outline-none"
               style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
      </label>
      <label class="block mb-4">
        <span class="text-[12px] mb-1 block" style="color: var(--rc-timestamp);">display name</span>
        <input type="text" bind:value={newBotDisplayName} placeholder="My Bot"
               class="w-full border px-3 py-2 text-[12px] font-mono outline-none"
               style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
      </label>
      <div class="flex justify-end gap-3">
        <button onclick={() => (showCreateBotModal = false)} class="text-[12px] hover:underline" style="color: var(--rc-timestamp);">cancel</button>
        <button onclick={createBot} disabled={creatingBot || !newBotUsername.trim() || !newBotDisplayName.trim()}
                class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
          {creatingBot ? 'creating...' : 'create'}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Manage Bot Modal -->
{#if managingBot}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
       role="dialog" aria-modal="true" aria-label="Manage bot" tabindex="-1"
       onkeydown={(e) => { if (e.key === 'Escape') managingBot = null; }}>
    <div class="p-6 w-full max-w-3xl mx-4 border max-h-[90vh] overflow-y-auto"
         style="background: var(--background); border-color: var(--border);">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-[14px] font-bold" style="color: var(--foreground);">
          manage: {managingBot.displayName}
          <span class="text-[12px] font-normal" style="color: var(--rc-timestamp);">(@{managingBot.username})</span>
        </h2>
        <button onclick={() => (managingBot = null)} class="text-[16px] leading-none hover:opacity-60"
                style="color: var(--rc-timestamp);" aria-label="Close">&times;</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Tokens -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[12px] font-bold mb-3" style="color: var(--foreground);">tokens</h3>
          <div class="flex gap-2 mb-3">
            <input type="text" bind:value={newTokenLabel} placeholder="token label (optional)"
                   class="flex-1 border px-3 py-1.5 text-[12px] font-mono outline-none"
                   style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);" />
            <button onclick={generateToken} disabled={generatingToken}
                    class="shrink-0 px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
              {generatingToken ? '...' : 'generate'}</button>
          </div>
          {#if botTokens.length > 0}
            <div class="space-y-2">
              {#each botTokens as token (token.id)}
                <div class="flex items-center justify-between p-2 border text-[11px]" style="border-color: var(--border);">
                  <div class="min-w-0 flex-1">
                    <span style="color: var(--foreground);">{token.label || '(no label)'}</span>
                    {#if token.revokedAt}
                      <span class="ml-2" style="color: var(--rc-mention-badge);">revoked</span>
                    {:else}
                      <span class="ml-2" style="color: var(--rc-olive);">active</span>
                    {/if}
                  </div>
                  {#if !token.revokedAt}
                    <button onclick={() => revokeToken(token.id)}
                            class="shrink-0 ml-2 text-[11px] hover:underline"
                            style="color: var(--rc-mention-badge);">revoke</button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[11px]" style="color: var(--rc-timestamp);">no tokens yet.</p>
          {/if}
        </div>
        <!-- Channel Bindings -->
        <div class="border p-4" style="border-color: var(--border);">
          <h3 class="text-[12px] font-bold mb-3" style="color: var(--foreground);">channel bindings</h3>
          <div class="flex gap-2 mb-3">
            <select bind:value={bindChannelId}
                    class="flex-1 border px-3 py-1.5 text-[12px] font-mono outline-none"
                    style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);">
              <option value={null}>select channel...</option>
              {#each unboundChannels as ch (ch.id)}
                <option value={ch.id}>#{ch.name}</option>
              {/each}
            </select>
            <button onclick={bindChannel} disabled={!bindChannelId}
                    class="shrink-0 px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
              bind</button>
          </div>
          {#if botBindings.length > 0}
            <div class="space-y-2">
              {#each botBindings as binding (binding.channelId)}
                <div class="flex items-center justify-between p-2 border text-[11px]" style="border-color: var(--border);">
                  <div class="min-w-0 flex-1">
                    <span style="color: var(--foreground);">{getChannelName(binding.channelId)}</span>
                    <span class="ml-2" style="color: var(--rc-timestamp);">
                      {#if binding.canRead && binding.canWrite}read/write
                      {:else if binding.canRead}read
                      {:else if binding.canWrite}write
                      {/if}
                    </span>
                  </div>
                  <button onclick={() => unbindChannel(binding.channelId)}
                          class="shrink-0 ml-2 text-[11px] hover:underline"
                          style="color: var(--rc-mention-badge);">unbind</button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[11px]" style="color: var(--rc-timestamp);">no channel bindings yet.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Generated Token Display Modal -->
{#if showTokenModal && generatedToken}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
       role="dialog" aria-modal="true" aria-label="Generated token" tabindex="-1"
       onkeydown={(e) => { if (e.key === 'Escape') { showTokenModal = false; generatedToken = ''; } }}>
    <div class="p-6 w-full max-w-lg mx-4 border" style="background: var(--background); border-color: var(--border);">
      <h2 class="text-[14px] font-bold mb-2" style="color: var(--foreground);">token generated</h2>
      <p class="text-[12px] mb-3" style="color: var(--rc-mention-badge);">
        copy this token now. it will not be shown again.
      </p>
      <div class="flex items-center gap-2 p-3 border" style="border-color: var(--border);">
        <code class="text-[12px] break-all flex-1" style="color: var(--rc-olive);">{generatedToken}</code>
        <button onclick={() => copyToClipboard(generatedToken)}
                class="shrink-0 px-2 py-1 text-[11px] border hover:opacity-70"
                style="border-color: var(--border); color: var(--rc-timestamp);">copy</button>
      </div>
      <div class="flex justify-end mt-4">
        <button onclick={() => { showTokenModal = false; generatedToken = ''; }}
                class="px-3 py-1.5 text-[11px] border font-mono"
                style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
          done</button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Bot Confirmation -->
{#if confirmDeleteBot}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
       role="dialog" aria-modal="true" aria-label="Confirm delete bot" tabindex="-1"
       onkeydown={(e) => { if (e.key === 'Escape') confirmDeleteBot = null; }}>
    <div class="p-6 w-full max-w-sm mx-4 border" style="background: var(--background); border-color: var(--border);">
      <h2 class="text-[14px] font-bold mb-2" style="color: var(--foreground);">delete bot</h2>
      <p class="text-[12px] mb-4" style="color: var(--foreground);">
        are you sure you want to delete <strong>{confirmDeleteBot.displayName}</strong> (@{confirmDeleteBot.username})?
        this cannot be undone.
      </p>
      <div class="flex justify-end gap-3">
        <button onclick={() => (confirmDeleteBot = null)} class="text-[12px] hover:underline" style="color: var(--rc-timestamp);">cancel</button>
        <button onclick={() => { if (confirmDeleteBot) deleteBot(confirmDeleteBot); }} disabled={deletingBot}
                class="px-3 py-1.5 text-[11px] border font-mono disabled:opacity-40"
                style="background: var(--rc-mention-badge); color: oklch(0.97 0 0); border-color: var(--rc-mention-badge);">
          {deletingBot ? 'deleting...' : 'delete'}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Reset Password Result Modal -->
{#if resetPasswordResult}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
       role="dialog" aria-modal="true" aria-label="Password reset" tabindex="-1"
       onkeydown={(e) => { if (e.key === 'Escape') { resetPasswordResult = ''; resetPasswordUser = ''; } }}>
    <div class="p-6 w-full max-w-lg mx-4 border" style="background: var(--background); border-color: var(--border);">
      <h2 class="text-[14px] font-bold mb-2" style="color: var(--foreground);">password reset for {resetPasswordUser}</h2>
      <p class="text-[12px] mb-3" style="color: var(--rc-mention-badge);">
        give this temporary password to the user. it will not be shown again.
      </p>
      <div class="flex items-center gap-2 p-3 border" style="border-color: var(--border);">
        <code class="text-[12px] break-all flex-1" style="color: var(--rc-olive);">{resetPasswordResult}</code>
        <button onclick={() => copyToClipboard(resetPasswordResult)}
                class="shrink-0 px-2 py-1 text-[11px] border hover:opacity-70"
                style="border-color: var(--border); color: var(--rc-timestamp);">copy</button>
      </div>
      <div class="flex justify-end mt-4">
        <button onclick={() => { resetPasswordResult = ''; resetPasswordUser = ''; }}
                class="px-3 py-1.5 text-[11px] border font-mono"
                style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);">
          done</button>
      </div>
    </div>
  </div>
{/if}
