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

  let channelId = $derived(Number($page.params.id));
  let channel = $derived(channelStore.channels.find((c) => c.id === channelId));
  let messages = $derived(messageStore.getMessages(channelId));
  let threadOpen = $derived(threadStore.openThreadId !== null);

  let loaded = $state(false);
  let lastMarkedMsgId = $state(0);

  async function loadMessages(id: number) {
    loaded = false;
    try {
      await messageStore.loadChannel(id);
    } catch {
      toastStore.error('Failed to load messages');
    }
    loaded = true;
  }

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
    goto(`/channels/${channelId}?thread=${parentId}`);
  }

  function closeThread() {
    goto(`/channels/${channelId}`);
  }
</script>

<div class="channel-view flex h-full min-h-0">
  <!-- Messages area -->
  <div class="main-panel flex flex-col flex-1 min-w-0 min-h-0 {threadOpen ? 'hidden md:flex' : 'flex'}">
    <!-- Channel header -->
    <div
      id="channel-header"
      class="channel-header flex items-center gap-3 px-4 py-3 border-b shrink-0"
      style="border-color: var(--border);"
    >
      <span id="channel-header-text" class="text-[13px] font-bold" style="color: var(--foreground);">
        # {channel?.name ?? 'Loading...'}
      </span>
    </div>

    <!-- Messages -->
    {#if !loaded}
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[12px] font-mono" style="color: var(--rc-timestamp);">loading...</span>
      </div>
    {:else}
      <MessageList {messages} onOpenThread={openThread} />
    {/if}

    <!-- Input -->
    <MessageInput
      onSend={handleSend}
      placeholder={channel ? `message #${channel.name}` : 'type a message...'}
    />
  </div>

  <!-- Thread panel -->
  {#if threadOpen}
    <ThreadPanel onClose={closeThread} />
  {/if}
</div>
