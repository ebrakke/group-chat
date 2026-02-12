<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { marked } from 'marked';
  import { websocket } from '$lib/stores/websocket.svelte';
  import { sendMessage, editMessage, deleteMessage, addReaction, removeReaction, type Message } from '$lib/api';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import EmojiPicker from '$lib/components/EmojiPicker.svelte';
  import FileUpload from '$lib/components/FileUpload.svelte';
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
  
  // Messages state - needs to be mutable for WebSocket updates
  // Initialize from data.messages to ensure correct initial state
  let messages = $state<Message[]>(data.messages);
  
  // Local UI state
  let messageInput = $state('');
  let sendingMessage = $state(false);
  let messagesContainer: HTMLDivElement;
  let shouldAutoScroll = $state(true);
  let showScrollButton = $state(false);
  
  // Edit state
  let editingMessageId: string | null = $state(null);
  let editingContent = $state('');
  
  // Hover state
  let hoveredMessageId: string | null = $state(null);
  
  // Thread state
  let openThreadId: string | null = $state(null);
  
  // Reaction state
  let showEmojiPicker = $state(false);
  let emojiPickerMessageId: string | null = $state(null);
  
  // File upload state
  let attachments: any[] = $state([]);
  
  // Mobile state
  let showMessageActions: string | null = $state(null);
  
  // Subscribe to WebSocket events for this channel
  // Re-subscribes when channel changes (cleanup runs automatically)
  $effect(() => {
    // Capture channelId to ensure effect re-runs when it changes
    const currentChannelId = data.channel.id;
    
    const handleNewMessage = (event: any) => {
      if (event.message?.channelId === currentChannelId) {
        messages = [...messages, event.message];
        if (shouldAutoScroll) {
          setTimeout(scrollToBottom, 100);
        }
      }
    };
    
    const handleUpdatedMessage = (event: any) => {
      if (event.message) {
        messages = messages.map(m =>
          m.id === event.message.id ? event.message : m
        );
      }
    };
    
    const handleDeletedMessage = (event: any) => {
      if (event.messageId) {
        messages = messages.filter(m => m.id !== event.messageId);
      }
    };
    
    const handleReaction = (event: any) => {
      if (event.messageId) {
        messages = messages.map(m => {
          if (m.id === event.messageId) {
            return { ...m, reactions: event.reactions || m.reactions };
          }
          return m;
        });
      }
    };
    
    websocket.on('message.new', handleNewMessage);
    websocket.on('message.updated', handleUpdatedMessage);
    websocket.on('message.deleted', handleDeletedMessage);
    websocket.on('reaction.added', handleReaction);
    websocket.on('reaction.removed', handleReaction);
    
    // Cleanup when channel changes or component unmounts
    return () => {
      websocket.off('message.new', handleNewMessage);
      websocket.off('message.updated', handleUpdatedMessage);
      websocket.off('message.deleted', handleDeletedMessage);
      websocket.off('reaction.added', handleReaction);
      websocket.off('reaction.removed', handleReaction);
    };
  });
  
  // Auto-scroll to bottom on mount
  $effect(() => {
    if (messagesContainer) {
      scrollToBottom();
    }
  });
  
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
  
  function handleScroll() {
    if (!messagesContainer) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    shouldAutoScroll = distanceFromBottom < 100;
    showScrollButton = distanceFromBottom > 300;
  }
  
  async function handleSendMessage(e: SubmitEvent) {
    e.preventDefault();
    
    if ((!messageInput.trim() && attachments.length === 0) || sendingMessage) {
      return;
    }
    
    sendingMessage = true;
    const content = messageInput;
    const currentAttachments = attachments;
    
    // Optimistically clear input
    messageInput = '';
    attachments = [];
    
    try {
      await sendMessage(data.channel.id, content, currentAttachments);
      // Message will be added via WebSocket
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Restore input on error
      messageInput = content;
      attachments = currentAttachments;
      alert('Failed to send message: ' + (err.message || 'Unknown error'));
    } finally {
      sendingMessage = false;
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  }
  
  function openThread(messageId: string) {
    goto(`/${$page.params.channel}/thread/${messageId}`);
  }
  
  function canEdit(message: Message): boolean {
    return message.author.id === data.user?.id;
  }
  
  function canDelete(message: Message): boolean {
    return message.author.id === data.user?.id || data.user?.role === 'admin';
  }
  
  function startEdit(message: Message) {
    editingMessageId = message.id;
    editingContent = message.content;
  }
  
  function cancelEdit() {
    editingMessageId = null;
    editingContent = '';
  }
  
  async function saveEdit() {
    if (!editingMessageId || !editingContent.trim()) return;
    
    try {
      await editMessage(editingMessageId, editingContent);
      editingMessageId = null;
      editingContent = '';
      // Update will come via WebSocket
    } catch (err: any) {
      console.error('Failed to edit message:', err);
      alert('Failed to edit message: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleDelete(messageId: string) {
    if (!confirm('Delete this message?')) return;
    
    try {
      await deleteMessage(messageId);
      // Delete will be reflected via WebSocket
    } catch (err: any) {
      console.error('Failed to delete message:', err);
      alert('Failed to delete message: ' + (err.message || 'Unknown error'));
    }
  }
  
  function showEmojiPickerFor(messageId: string) {
    emojiPickerMessageId = messageId;
    showEmojiPicker = true;
  }
  
  function closeEmojiPicker() {
    showEmojiPicker = false;
    emojiPickerMessageId = null;
  }
  
  async function handleEmojiSelect(emoji: string) {
    if (!emojiPickerMessageId) return;
    
    try {
      await addReaction(emojiPickerMessageId, emoji);
      closeEmojiPicker();
    } catch (err: any) {
      console.error('Failed to add reaction:', err);
      alert('Failed to add reaction: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleReactionClick(messageId: string, emoji: string) {
    const message = messages.find(m => m.id === messageId);
    if (!message || !data.user) return;
    
    const hasReacted = message.reactions[emoji]?.includes(data.user.id);
    
    try {
      if (hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    } catch (err: any) {
      console.error('Failed to toggle reaction:', err);
      alert('Failed to toggle reaction: ' + (err.message || 'Unknown error'));
    }
  }
  
  function renderMarkdown(content: string): string {
    return marked(content, { breaks: true });
  }
  
  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  }
  
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  
  function isImage(mimeType: string): boolean {
    return mimeType?.startsWith('image/');
  }
  
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  function toggleSidebar() {
    // Mobile hamburger - dispatch event to layout
    window.dispatchEvent(new CustomEvent('toggle-sidebar'));
  }
</script>

{#key $page.url.pathname}
<div class="flex flex-col h-full">
  <!-- Header -->
  <header class="border-b bg-white px-4 md:px-6 py-3 md:py-4">
    <div class="flex items-center justify-between gap-3">
      <!-- Hamburger menu (mobile only) -->
      <button
        onclick={toggleSidebar}
        class="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded -ml-2"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      
      <div class="flex-1 min-w-0">
        <h1 class="text-base md:text-lg font-semibold text-gray-900 truncate">
          # {data.channel.name}
        </h1>
        <p class="text-sm text-gray-500 truncate hidden md:block">
          {data.channel.description}
        </p>
      </div>
    </div>
  </header>
  
  <!-- Messages -->
  <div 
    bind:this={messagesContainer}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto p-3 md:p-6 space-y-3 md:space-y-4"
    data-testid="message-list"
  >
    {#if messages.length === 0}
      <div class="text-center text-gray-500">
        <p class="text-sm">No messages yet. Be the first to say something!</p>
      </div>
    {:else}
      {#each messages as message (message.id)}
        <div 
          class="flex gap-2 md:gap-3 group"
          onmouseenter={() => hoveredMessageId = message.id}
          onmouseleave={() => hoveredMessageId = null}
        >
          <div class="flex-shrink-0">
            <div class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs md:text-sm font-medium">
              {getInitials(message.author.displayName)}
            </div>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-1">
              <span class="font-semibold text-gray-900">{message.author.displayName}</span>
              <span class="text-xs text-gray-500">{formatTimestamp(message.createdAt)}</span>
              {#if message.editedAt}
                <span class="text-xs text-gray-400 italic">(edited)</span>
              {/if}
            </div>
            
            {#if editingMessageId === message.id}
              <div class="space-y-2">
                <textarea
                  bind:value={editingContent}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                ></textarea>
                <div class="flex gap-2">
                  <button
                    onclick={saveEdit}
                    class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onclick={cancelEdit}
                    class="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <div class="prose prose-sm max-w-none text-gray-800">
                {@html renderMarkdown(message.content)}
              </div>
              
              <!-- Attachments -->
              {#if message.attachments && message.attachments.length > 0}
                <div class="mt-2 space-y-2">
                  {#each message.attachments as attachment}
                    {#if isImage(attachment.mimeType)}
                      <img
                        src={attachment.url}
                        alt={attachment.filename}
                        class="w-full md:max-w-md rounded-lg border shadow-sm"
                        loading="lazy"
                      />
                    {:else}
                      <a
                        href={attachment.url}
                        download={attachment.filename}
                        class="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 border"
                      >
                        <span class="text-sm font-medium text-gray-900">{attachment.filename}</span>
                        <span class="text-xs text-gray-500">{formatFileSize(attachment.size)}</span>
                      </a>
                    {/if}
                  {/each}
                </div>
              {/if}
              
              <!-- Reactions -->
              {#if Object.keys(message.reactions).length > 0}
                <div class="flex flex-wrap gap-1 mt-2">
                  {#each Object.entries(message.reactions) as [emoji, userIds]}
                    <button
                      onclick={() => handleReactionClick(message.id, emoji)}
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition-colors {userIds.includes(data.user?.id || '') ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}"
                    >
                      <span>{emoji}</span>
                      <span class="text-xs font-medium">{userIds.length}</span>
                    </button>
                  {/each}
                </div>
              {/if}
              
              <!-- Thread count -->
              {#if message.threadCount > 0}
                <button
                  onclick={() => openThread(message.id)}
                  class="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                >
                  💬 {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
                </button>
              {/if}
              
              <!-- Message actions -->
              {#if hoveredMessageId === message.id || showMessageActions === message.id}
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    onclick={() => showEmojiPickerFor(message.id)}
                    class="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                  >
                    🙂 React
                  </button>
                  <button
                    onclick={() => openThread(message.id)}
                    class="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                  >
                    💬 Reply
                  </button>
                  {#if canEdit(message)}
                    <button
                      onclick={() => startEdit(message)}
                      class="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                    >
                      ✏️ Edit
                    </button>
                  {/if}
                  {#if canDelete(message)}
                    <button
                      onclick={() => handleDelete(message.id)}
                      class="text-xs px-2 py-1 text-red-500 hover:text-red-700"
                    >
                      🗑️ Delete
                    </button>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    {/if}
    
    {#if showScrollButton}
      <button
        onclick={scrollToBottom}
        class="fixed bottom-20 md:bottom-24 right-4 md:right-8 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700"
        title="Scroll to bottom"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    {/if}
  </div>
  
  <!-- Message input -->
  <div class="border-t bg-white p-3 md:p-4">
    <form onsubmit={handleSendMessage}>
      <FileUpload
        bind:attachments={attachments}
      />
      <div class="flex gap-2 items-end">
        <div class="flex-1">
          <textarea
            bind:value={messageInput}
            onkeydown={handleKeyDown}
            placeholder="Message #{data.channel.name}"
            disabled={sendingMessage}
            class="w-full rounded-md border border-gray-300 px-3 md:px-4 py-2.5 md:py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 resize-none"
            rows="1"
          ></textarea>
        </div>
        <button
          type="submit"
          disabled={sendingMessage || (!messageInput.trim() && attachments.length === 0)}
          class="px-3 md:px-4 py-2.5 md:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {sendingMessage ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  </div>
</div>
{/key}

<!-- Emoji Picker -->
{#if showEmojiPicker}
  <EmojiPicker 
    onSelect={handleEmojiSelect}
    onClose={closeEmojiPicker}
  />
{/if}

<style>
  :global(.prose) {
    max-width: none;
  }
  
  :global(.prose p) {
    margin: 0.25rem 0;
  }
  
  :global(.prose code) {
    background-color: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  
  :global(.prose pre) {
    background-color: #1f2937;
    color: #f9fafb;
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
  }
  
  :global(.prose pre code) {
    background-color: transparent;
    padding: 0;
    color: inherit;
  }
</style>
