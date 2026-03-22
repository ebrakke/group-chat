<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { dmStore } from '$lib/stores/dms.svelte';
  import { authStore } from '$lib/stores/auth';
  import { messageStore } from '$lib/stores/messages';
  import { channelStore } from '$lib/stores/channels';
  import { threadStore } from '$lib/stores/threads';
  import { uploadFile } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import MessageInput from '$lib/components/MessageInput.svelte';
  import TypingIndicator from '$lib/components/TypingIndicator.svelte';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import ProfilePanel from '$lib/components/ProfilePanel.svelte';

  let dmId = $derived(Number($page.params.id));
  let conversation = $derived(dmStore.conversations.find((c) => c.id === dmId));
  let channelId = $derived(conversation?.channelId ?? 0);
  let messages = $derived(channelId ? messageStore.getMessages(channelId) : []);
  let threadOpen = $derived(threadStore.openThreadId !== null);

  let loaded = $state(false);
  let lastMarkedMsgId = $state(0);

  interface ProfileData {
    userId?: number;
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

  $effect(() => {
    if (dmId) {
      channelStore.setActive(0);
      dmStore.setActive(dmId);
    }
  });

  $effect(() => {
    if (channelId) {
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

  // Mark DM as read when messages load or new ones arrive
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
          dmStore.markRead(id);
        }
      }
    });
  });

  async function handleSend(content: string, files?: File[]) {
    try {
      const msgContent = content || (files?.length ? files.map(f => f.name).join(', ') : '');
      if (msgContent) {
        await messageStore.send(channelId, msgContent);
      }
      if (files?.length) {
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
    goto(`/dms/${dmId}?thread=${parentId}`);
  }

  function closeThread() {
    goto(`/dms/${dmId}`);
  }

  function openProfile(profile: ProfileData) {
    profileOpen = profile;
  }

  function closeProfile() {
    profileOpen = null;
  }
</script>

<div class="channel-view flex h-full min-h-0">
  <div class="main-panel flex flex-col flex-1 min-w-0 min-h-0 {rightPanel ? 'hidden md:flex' : 'flex'}">
    <div
      class="channel-header flex items-center gap-3 px-4 py-3 border-b shrink-0"
      style="border-color: var(--border);"
    >
      {#if conversation}
        {#if conversation.otherAvatarUrl}
          <img src={conversation.otherAvatarUrl} alt="" class="w-5 h-5 rounded-full object-cover" />
        {:else}
          <span
            class="inline-flex items-center justify-center w-5 h-5 text-[11px] border shrink-0"
            style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);"
          >{conversation.otherDisplayName.charAt(0).toUpperCase()}</span>
        {/if}
        <span class="text-[13px] font-bold" style="color: var(--foreground);">
          {conversation.otherDisplayName}
        </span>
      {:else}
        <span class="text-[13px] font-bold" style="color: var(--foreground);">Loading...</span>
      {/if}
    </div>

    {#if !loaded}
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[12px] font-mono" style="color: var(--rc-timestamp);">loading...</span>
      </div>
    {:else}
      <MessageList {messages} onOpenThread={openThread} onOpenProfile={openProfile} />
    {/if}

    <TypingIndicator {channelId} />

    <MessageInput
      onSend={handleSend}
      placeholder={conversation ? `message ${conversation.otherDisplayName}` : 'type a message...'}
      {channelId}
    />
  </div>

  {#if rightPanel === 'thread'}
    <ThreadPanel onClose={closeThread} />
  {/if}

  {#if rightPanel === 'profile' && profileOpen}
    <ProfilePanel
      displayName={profileOpen.displayName}
      username={profileOpen.username}
      avatarUrl={profileOpen.avatarUrl}
      role={profileOpen.role}
      userCreatedAt={profileOpen.userCreatedAt}
      isBot={profileOpen.isBot}
      onClose={closeProfile}
      onMessage={profileOpen.userId && profileOpen.userId !== authStore.user?.id ? async () => {
        const conv = await dmStore.startDM(profileOpen!.userId!);
        closeProfile();
        goto(`/dms/${conv.id}`);
      } : undefined}
    />
  {/if}
</div>
