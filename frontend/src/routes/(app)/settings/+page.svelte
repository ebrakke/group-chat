<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import { channelStore } from '$lib/stores/channels';
  import type { NotificationSettings, Bot, BotToken, ChannelBinding, Invite, Channel } from '$lib/types';

  // --- Notification Settings ---
  let notifyMentions = $state(true);
  let notifyThreadReplies = $state(true);
  let notifyAllMessages = $state(false);
  let notifMessage = $state('');
  let notifError = $state('');
  let savingNotif = $state(false);

  // --- Admin Settings ---
  let baseUrl = $state('');
  let baseUrlMessage = $state('');
  let baseUrlError = $state('');
  let savingBaseUrl = $state(false);

  let ntfyServerUrl = $state('');
  let ntfyMessage = $state('');
  let ntfyError = $state('');
  let savingNtfy = $state(false);

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

  // --- Load notification settings ---
  async function loadNotificationSettings() {
    try {
      const settings = await api<NotificationSettings>('GET', '/api/notifications/settings');
      notifyMentions = settings.notifyMentions;
      notifyThreadReplies = settings.notifyThreadReplies;
      notifyAllMessages = settings.notifyAllMessages;
    } catch {
      // Use defaults
    }
  }

  async function saveNotificationSettings() {
    savingNotif = true;
    notifError = '';
    notifMessage = '';
    try {
      await api('POST', '/api/notifications/settings', {
        notifyMentions,
        notifyThreadReplies,
        notifyAllMessages
      });
      notifMessage = 'Notification settings saved successfully';
      autoHide((v) => (notifMessage = v));
    } catch (err: unknown) {
      notifError = err instanceof Error ? err.message : 'Failed to save settings';
      autoHide((v) => (notifError = v));
    } finally {
      savingNotif = false;
    }
  }

  // --- Admin settings ---
  async function loadAdminSettings() {
    try {
      const settings = await api<{ baseUrl?: string; ntfyServerUrl?: string }>(
        'GET',
        '/api/admin/settings'
      );
      baseUrl = settings.baseUrl || '';
      ntfyServerUrl = settings.ntfyServerUrl || '';
    } catch {
      // ignore
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

  async function saveNtfySettings() {
    savingNtfy = true;
    ntfyError = '';
    ntfyMessage = '';
    try {
      await api('POST', '/api/admin/settings', { ntfy_server_url: ntfyServerUrl });
      ntfyMessage = 'ntfy settings saved';
      autoHide((v) => (ntfyMessage = v));
    } catch (err: unknown) {
      ntfyError = err instanceof Error ? err.message : 'Failed to save';
      autoHide((v) => (ntfyError = v));
    } finally {
      savingNtfy = false;
    }
  }

  // --- Invites ---
  async function loadInvites() {
    try {
      invites = await api<Invite[]>('GET', '/api/invites');
    } catch {
      // ignore
    }
  }

  async function createInvite() {
    creatingInvite = true;
    try {
      const result = await api<{ code: string }>('POST', '/api/invites');
      inviteResult = `${window.location.origin}/invite/${result.code}`;
      await loadInvites();
    } catch {
      // ignore
    } finally {
      creatingInvite = false;
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  // --- Bots ---
  async function loadBots() {
    try {
      bots = await api<Bot[]>('GET', '/api/bots');
    } catch {
      // ignore
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
      // ignore
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
      // ignore
    } finally {
      generatingToken = false;
    }
  }

  async function revokeToken(tokenId: number) {
    try {
      await api('DELETE', `/api/bots/tokens/${tokenId}`);
      if (managingBot) await loadBotTokens(managingBot.id);
    } catch {
      // ignore
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
      // ignore
    }
  }

  async function unbindChannel(channelId: number) {
    if (!managingBot) return;
    try {
      await api('DELETE', `/api/bots/${managingBot.id}/bindings/${channelId}`);
      await loadBotBindings(managingBot.id);
    } catch {
      // ignore
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
    loadNotificationSettings();
    if (authStore.isAdmin) {
      loadAdminSettings();
      loadInvites();
      loadBots();
    }
  });
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center px-4 py-3 border-b border-gray-800 shrink-0">
    <button onclick={() => goto('/channels')} class="text-gray-400 hover:text-white mr-3" aria-label="Back">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <h2 class="text-lg font-bold text-white">Settings</h2>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    <div class="max-w-2xl mx-auto space-y-4">

      <!-- Section 1: Notification Preferences -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 class="text-base font-semibold text-white mb-3">Notification Preferences</h3>

        <div class="space-y-3">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              id="notify-mentions"
              type="checkbox"
              bind:checked={notifyMentions}
              class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span class="text-sm text-gray-300">Notify on @mentions</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              id="notify-thread-replies"
              type="checkbox"
              bind:checked={notifyThreadReplies}
              class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span class="text-sm text-gray-300">Notify on thread replies</span>
          </label>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              id="notify-all-messages"
              type="checkbox"
              bind:checked={notifyAllMessages}
              class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span class="text-sm text-gray-300">Notify on all messages</span>
          </label>
        </div>

        {#if notifMessage}
          <p class="text-green-400 text-sm mt-3">{notifMessage}</p>
        {/if}
        {#if notifError}
          <p class="text-red-400 text-sm mt-3">{notifError}</p>
        {/if}

        <button
          id="save-notifications"
          onclick={saveNotificationSettings}
          disabled={savingNotif}
          class="mt-4 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          {savingNotif ? 'Saving...' : 'Save'}
        </button>
      </div>

      <!-- Section 2: Account -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 class="text-base font-semibold text-white mb-3">Account</h3>

        <div class="space-y-2 mb-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">Username:</span>
            <span class="text-sm text-gray-200">@{authStore.user?.username}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">Display name:</span>
            <span class="text-sm text-gray-200">{authStore.user?.displayName}</span>
          </div>
        </div>

        <button
          id="logout"
          onclick={() => { authStore.logout(); goto('/login'); }}
          class="px-4 py-2 text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
        >
          Logout
        </button>
      </div>

      <!-- Admin sections (only visible to admins) -->
      {#if authStore.isAdmin}

        <!-- Section 3: General Settings -->
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-base font-semibold text-white mb-3">General Settings</h3>

          <label class="block mb-3">
            <span class="text-sm text-gray-400 mb-1 block">Base URL</span>
            <input
              id="base-url"
              type="text"
              bind:value={baseUrl}
              placeholder="https://your-domain.com"
              class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </label>

          {#if baseUrlMessage}
            <p class="text-green-400 text-sm mb-2">{baseUrlMessage}</p>
          {/if}
          {#if baseUrlError}
            <p class="text-red-400 text-sm mb-2">{baseUrlError}</p>
          {/if}

          <button
            id="save-base-url"
            onclick={saveBaseUrl}
            disabled={savingBaseUrl}
            class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
          >
            {savingBaseUrl ? 'Saving...' : 'Save'}
          </button>
        </div>

        <!-- Section 4: Push Notifications -->
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-base font-semibold text-white mb-3">Push Notifications</h3>

          <label class="block mb-3">
            <span class="text-sm text-gray-400 mb-1 block">ntfy Server URL</span>
            <p class="text-xs text-gray-500 mb-2">
              The URL of your ntfy server for push notifications. Leave empty to use the default ntfy.sh.
            </p>
            <input
              id="ntfy-server-url"
              type="text"
              bind:value={ntfyServerUrl}
              placeholder="https://ntfy.sh"
              class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </label>

          {#if ntfyMessage}
            <p class="text-green-400 text-sm mb-2">{ntfyMessage}</p>
          {/if}
          {#if ntfyError}
            <p class="text-red-400 text-sm mb-2">{ntfyError}</p>
          {/if}

          <button
            id="save-ntfy-settings"
            onclick={saveNtfySettings}
            disabled={savingNtfy}
            class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
          >
            {savingNtfy ? 'Saving...' : 'Save'}
          </button>
        </div>

        <!-- Section 5: Invites -->
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-base font-semibold text-white mb-3">Invites</h3>

          <span id="admin-create-invite">
            <button
              id="create-invite"
              onclick={createInvite}
              disabled={creatingInvite}
              class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              {creatingInvite ? 'Creating...' : 'Create Invite'}
            </button>
          </span>

          {#if inviteResult}
            <div id="invite-result" class="mt-3 p-3 bg-gray-800 rounded border border-gray-700">
              <div id="admin-invite-result">
                <p class="text-xs text-gray-400 mb-1">Invite link:</p>
                <div class="flex items-center gap-2">
                  <code class="invite-code text-sm text-green-400 break-all flex-1">{inviteResult}</code>
                  <button
                    onclick={() => copyToClipboard(inviteResult)}
                    class="copy-link-btn shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          {/if}

          {#if invites.length > 0}
            <div class="mt-4 space-y-2">
              <h4 class="text-sm font-medium text-gray-400">Existing Invites</h4>
              {#each invites as invite (invite.code)}
                <div class="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                  <div class="min-w-0 flex-1">
                    <code class="text-xs text-gray-300 break-all">{invite.code}</code>
                    <p class="text-xs text-gray-500 mt-0.5">
                      Used {invite.useCount} time{invite.useCount !== 1 ? 's' : ''}
                      {#if invite.maxUses}
                        / {invite.maxUses} max
                      {/if}
                    </p>
                  </div>
                  <button
                    onclick={() => copyToClipboard(`${window.location.origin}/invite/${invite.code}`)}
                    class="shrink-0 ml-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Section 6: Bots -->
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-base font-semibold text-white mb-3">Bots</h3>

          <button
            onclick={() => { showCreateBotModal = true; newBotUsername = ''; newBotDisplayName = ''; createBotError = ''; }}
            class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Create Bot
          </button>

          {#if bots.length > 0}
            <div class="mt-4 space-y-2">
              {#each bots as bot (bot.id)}
                <div class="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
                  <div>
                    <p class="text-sm font-medium text-white">{bot.displayName}</p>
                    <p class="text-xs text-gray-500">@{bot.username}</p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      onclick={() => openManageBot(bot)}
                      class="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    >
                      Manage
                    </button>
                    <button
                      onclick={() => (confirmDeleteBot = bot)}
                      class="px-3 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-gray-500 mt-3">No bots created yet.</p>
          {/if}
        </div>

      {/if}
    </div>
  </div>
</div>

<!-- Create Bot Modal -->
{#if showCreateBotModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Create bot"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') showCreateBotModal = false; }}
  >
    <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
      <h2 class="text-lg font-bold text-white mb-4">Create Bot</h2>

      {#if createBotError}
        <p class="text-red-400 text-sm mb-3">{createBotError}</p>
      {/if}

      <label class="block mb-3">
        <span class="text-sm text-gray-300 mb-1 block">Username</span>
        <input
          type="text"
          value={newBotUsername}
          oninput={handleBotUsernameInput}
          placeholder="my-bot"
          class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </label>

      <label class="block mb-4">
        <span class="text-sm text-gray-300 mb-1 block">Display Name</span>
        <input
          type="text"
          bind:value={newBotDisplayName}
          placeholder="My Bot"
          class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </label>

      <div class="flex justify-end gap-3">
        <button
          onclick={() => (showCreateBotModal = false)}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={createBot}
          disabled={creatingBot || !newBotUsername.trim() || !newBotDisplayName.trim()}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {creatingBot ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Manage Bot Modal -->
{#if managingBot}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Manage bot"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') managingBot = null; }}
  >
    <div class="bg-gray-800 rounded-lg p-6 w-full max-w-3xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white">
          Manage: {managingBot.displayName}
          <span class="text-sm font-normal text-gray-500">(@{managingBot.username})</span>
        </h2>
        <button
          onclick={() => (managingBot = null)}
          class="text-gray-400 hover:text-white"
          aria-label="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Tokens Section -->
        <div class="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 class="text-sm font-semibold text-white mb-3">Tokens</h3>

          <!-- Generate token -->
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              bind:value={newTokenLabel}
              placeholder="Token label (optional)"
              class="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onclick={generateToken}
              disabled={generatingToken}
              class="shrink-0 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              {generatingToken ? '...' : 'Generate'}
            </button>
          </div>

          <!-- Token list -->
          {#if botTokens.length > 0}
            <div class="space-y-2">
              {#each botTokens as token (token.id)}
                <div class="flex items-center justify-between p-2 bg-gray-800 rounded text-xs">
                  <div class="min-w-0 flex-1">
                    <span class="text-gray-300">{token.label || '(no label)'}</span>
                    {#if token.revokedAt}
                      <span class="ml-2 text-red-400">revoked</span>
                    {:else}
                      <span class="ml-2 text-green-400">active</span>
                    {/if}
                  </div>
                  {#if !token.revokedAt}
                    <button
                      onclick={() => revokeToken(token.id)}
                      class="shrink-0 ml-2 px-2 py-0.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
                    >
                      Revoke
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-500">No tokens yet.</p>
          {/if}
        </div>

        <!-- Channel Bindings Section -->
        <div class="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 class="text-sm font-semibold text-white mb-3">Channel Bindings</h3>

          <!-- Bind to channel -->
          <div class="flex gap-2 mb-3">
            <select
              bind:value={bindChannelId}
              class="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value={null}>Select channel...</option>
              {#each unboundChannels as ch (ch.id)}
                <option value={ch.id}>#{ch.name}</option>
              {/each}
            </select>
            <button
              onclick={bindChannel}
              disabled={!bindChannelId}
              class="shrink-0 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              Bind
            </button>
          </div>

          <!-- Binding list -->
          {#if botBindings.length > 0}
            <div class="space-y-2">
              {#each botBindings as binding (binding.channelId)}
                <div class="flex items-center justify-between p-2 bg-gray-800 rounded text-xs">
                  <div class="min-w-0 flex-1">
                    <span class="text-gray-300">{getChannelName(binding.channelId)}</span>
                    <span class="ml-2 text-gray-500">
                      {#if binding.canRead && binding.canWrite}
                        read/write
                      {:else if binding.canRead}
                        read
                      {:else if binding.canWrite}
                        write
                      {/if}
                    </span>
                  </div>
                  <button
                    onclick={() => unbindChannel(binding.channelId)}
                    class="shrink-0 ml-2 px-2 py-0.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded transition-colors"
                  >
                    Unbind
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-500">No channel bindings yet.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Generated Token Display Modal -->
{#if showTokenModal && generatedToken}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
    role="dialog"
    aria-modal="true"
    aria-label="Generated token"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') { showTokenModal = false; generatedToken = ''; } }}
  >
    <div class="bg-gray-800 rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl">
      <h2 class="text-lg font-bold text-white mb-2">Token Generated</h2>
      <p class="text-sm text-yellow-400 mb-3">
        Copy this token now. It will not be shown again.
      </p>

      <div class="flex items-center gap-2 p-3 bg-gray-900 rounded border border-gray-700">
        <code class="text-sm text-green-400 break-all flex-1">{generatedToken}</code>
        <button
          onclick={() => copyToClipboard(generatedToken)}
          class="shrink-0 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          Copy
        </button>
      </div>

      <div class="flex justify-end mt-4">
        <button
          onclick={() => { showTokenModal = false; generatedToken = ''; }}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Bot Confirmation -->
{#if confirmDeleteBot}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm delete bot"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') confirmDeleteBot = null; }}
  >
    <div class="bg-gray-800 rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl">
      <h2 class="text-lg font-bold text-white mb-2">Delete Bot</h2>
      <p class="text-sm text-gray-300 mb-4">
        Are you sure you want to delete <strong>{confirmDeleteBot.displayName}</strong> (@{confirmDeleteBot.username})?
        This cannot be undone.
      </p>

      <div class="flex justify-end gap-3">
        <button
          onclick={() => (confirmDeleteBot = null)}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={() => { if (confirmDeleteBot) deleteBot(confirmDeleteBot); }}
          disabled={deletingBot}
          class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          {deletingBot ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}
