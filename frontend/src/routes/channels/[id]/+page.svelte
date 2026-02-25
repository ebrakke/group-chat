<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import { channelStore } from '$lib/stores/channels';
  import { messageStore } from '$lib/stores/messages';
  import MessageList from '$lib/components/MessageList.svelte';
  import MessageInput from '$lib/components/MessageInput.svelte';

  let channelId = $derived(Number($page.params.id));
  let channel = $derived(channelStore.channels.find((c) => c.id === channelId));
  let messages = $derived(messageStore.getMessages(channelId));

  let loaded = $state(false);
  let lastReadChannel = $state(0);

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

  // Mark channel as read when messages are loaded (only once per channel load)
  $effect(() => {
    const id = channelId;
    const msgs = messages;
    const isLoaded = loaded;
    untrack(() => {
      if (isLoaded && msgs.length > 0 && id && lastReadChannel !== id) {
        lastReadChannel = id;
        const lastMessage = msgs[msgs.length - 1];
        channelStore.markRead(id, lastMessage.id);
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
    // Placeholder for Task 7 - thread panel integration
    console.log('Open thread:', parentId);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Channel header -->
  <div
    id="channel-header"
    class="flex items-center px-4 py-3 border-b border-gray-800 shrink-0"
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
