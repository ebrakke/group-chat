<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { untrack } from 'svelte';
  import { channelStore } from '$lib/stores/channels';
  import { messageStore } from '$lib/stores/messages';
  import { threadStore } from '$lib/stores/threads';
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
      // ignore load errors
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

  // Open thread from URL query param
  onMount(() => {
    const threadParam = $page.url.searchParams.get('thread');
    if (threadParam) {
      const parentId = Number(threadParam);
      if (parentId) {
        openThread(parentId);
      }
    }
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

  async function handleSend(content: string) {
    try {
      await messageStore.send(channelId, content);
      // Reload messages to get the sent message (until WebSocket is set up)
      await messageStore.loadChannel(channelId);
    } catch {
      // ignore send errors
    }
  }

  function openThread(parentId: number) {
    const parentMsg = messages.find((m) => m.id === parentId);
    threadStore.openThread(parentId, parentMsg);
  }

  function closeThread() {
    threadStore.closeThread();
  }
</script>

<div class="channel-view flex h-full min-h-0">
  <!-- Messages area -->
  <div class="main-panel flex flex-col flex-1 min-w-0 min-h-0 {threadOpen ? 'hidden md:flex' : 'flex'}">
    <!-- Channel header -->
    <div
      id="channel-header"
      class="channel-header flex items-center px-4 py-3 border-b border-gray-700/40 shrink-0"
    >
      <h2 id="channel-header-text" class="text-lg font-bold text-white">
        # {channel?.name ?? 'Loading...'}
      </h2>
    </div>

    <!-- Messages -->
    <MessageList {messages} onOpenThread={openThread} />

    <!-- Input -->
    <MessageInput
      onSend={handleSend}
      placeholder={channel ? `Message #${channel.name}` : 'Type a message...'}
    />
  </div>

  <!-- Thread panel -->
  {#if threadOpen}
    <div class="w-full md:w-[400px] md:shrink-0">
      <ThreadPanel onClose={closeThread} />
    </div>
  {/if}
</div>
