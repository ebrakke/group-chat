<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { channelStore } from '$lib/stores/channels';
  import { messageStore } from '$lib/stores/messages';
  import { threadStore } from '$lib/stores/threads';
  import { uploadFile } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import MessageInput from '$lib/components/MessageInput.svelte';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import ProfilePanel from '$lib/components/ProfilePanel.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';

  let channelSlug = $derived($page.params.id);
  let channel = $derived(channelStore.getByName(channelSlug));
  let channelId = $derived(channel?.id ?? 0);
  let messages = $derived(channelId ? messageStore.getMessages(channelId) : []);
  let threadOpen = $derived(threadStore.openThreadId !== null);

  let loaded = $state(false);
  let lastMarkedMsgId = $state(0);

  interface ProfileData {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
    userCreatedAt?: string;
    isBot?: boolean;
  }

  let profileOpen = $state<ProfileData | null>(null);

  let rightPanel = $derived<'thread' | 'profile' | null>(
    profileOpen ? 'profile' : threadOpen ? 'thread' : null
  );

  async function loadMessages(id: number) {
    loaded = false;
    try {
      await messageStore.loadChannel(id);
    } catch {
      toastStore.error('Failed to load messages');
    }
    loaded = true;
  }

  // Backward compat: redirect numeric IDs to slug
  $effect(() => {
    const slug = channelSlug;
    if (/^\d+$/.test(slug)) {
      const name = channelStore.getNameById(Number(slug));
      if (name) {
        goto(`/channels/${name}`, { replaceState: true });
        return;
      }
    }
  });

  // Load messages when channel changes
  $effect(() => {
    if (channelId) {
      channelStore.setActive(channelId);
      loadMessages(channelId);
    }
  });

  // Sync thread state with URL query param
  $effect(() => {
    const threadParam = $page.url.searchParams.get('thread');
    const parentId = threadParam ? Number(threadParam) : null;
    const isLoaded = loaded;

    untrack(() => {
      if (parentId && isLoaded && parentId !== threadStore.openThreadId) {
        const parentMsg = messageStore.getMessages(channelId).find((m) => m.id === parentId);
        threadStore.openThread(parentId, parentMsg);
      } else if (!parentId && threadStore.openThreadId !== null) {
        threadStore.closeThread();
      }
    });
  });

  // Mark channel as read when messages load or new ones arrive via WebSocket
  $effect(() => {
    const id = channelId;
    const msgs = messages;
    const isLoaded = loaded;
    untrack(() => {
      if (isLoaded && msgs.length > 0 && id) {
        const lastMessage = msgs[msgs.length - 1];
        if (lastMessage.id !== lastMarkedMsgId) {
          lastMarkedMsgId = lastMessage.id;
          channelStore.markRead(id, lastMessage.id);
        }
      }
    });
  });

  async function handleSend(content: string, files?: File[]) {
    try {
      // Always send a message if there's content or files (files need a message to attach to)
      const msgContent = content || (files?.length ? files.map(f => f.name).join(', ') : '');
      if (msgContent) {
        await messageStore.send(channelId, msgContent);
      }
      if (files?.length) {
        // Reload to get the message ID for file attachment
        await messageStore.loadChannel(channelId);
        const msgs = messageStore.getMessages(channelId);
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) {
          for (const f of files) {
            await uploadFile(f, lastMsg.id);
          }
        }
      }
      await messageStore.loadChannel(channelId);
    } catch {
      toastStore.error('Failed to send message');
    }
  }

  function openThread(parentId: number) {
    goto(`/channels/${channelSlug}?thread=${parentId}`);
  }

  function closeThread() {
    goto(`/channels/${channelSlug}`);
  }

  function openProfile(profile: ProfileData) {
    profileOpen = profile;
  }

  function closeProfile() {
    profileOpen = null;
  }
</script>

<div class="channel-view flex h-full min-h-0">
  <!-- Messages area -->
  <div class="main-panel flex flex-col flex-1 min-w-0 min-h-0 {rightPanel ? 'hidden md:flex' : 'flex'}">
    <!-- Channel header -->
    <div
      id="channel-header"
      class="channel-header flex items-center gap-3 px-4 py-3 border-b shrink-0"
      style="border-color: var(--border);"
    >
      <span id="channel-header-text" class="text-[13px] font-bold" style="color: var(--foreground);">
        # {channel?.name ?? 'Loading...'}
      </span>
      <div class="ml-auto">
        {#if channelId}
          <NotificationBell {channelId} />
        {/if}
      </div>
    </div>

    <!-- Messages -->
    {#if !loaded}
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[12px] font-mono" style="color: var(--rc-timestamp);">loading...</span>
      </div>
    {:else}
      <MessageList {messages} onOpenThread={openThread} onOpenProfile={openProfile} />
    {/if}

    <!-- Input -->
    <MessageInput
      onSend={handleSend}
      placeholder={channel ? `message #${channel.name}` : 'type a message...'}
    />
  </div>

  <!-- Thread panel -->
  {#if rightPanel === 'thread'}
    <ThreadPanel onClose={closeThread} />
  {/if}

  <!-- Profile panel -->
  {#if rightPanel === 'profile' && profileOpen}
    <ProfilePanel
      displayName={profileOpen.displayName}
      username={profileOpen.username}
      avatarUrl={profileOpen.avatarUrl}
      role={profileOpen.role}
      userCreatedAt={profileOpen.userCreatedAt}
      isBot={profileOpen.isBot}
      onClose={closeProfile}
    />
  {/if}
</div>
