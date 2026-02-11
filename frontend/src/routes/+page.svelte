<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import { fetchChannels, fetchMessages, sendMessage, editMessage, deleteMessage, fetchCurrentUser, checkHasUsers, addReaction, removeReaction, type Message, type Channel, type User } from '$lib/api';
  import { ChatWebSocket } from '$lib/websocket';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import EmojiPicker from '$lib/components/EmojiPicker.svelte';
  
  let loading = $state(true);
  let isFirstUser = $state(false);
  let user: User | null = $state(null);
  let channels: Channel[] = $state([]);
  let currentChannel = $state('general');
  let messages: Message[] = $state([]);
  let messageInput = $state('');
  let sendingMessage = $state(false);
  let loadingMessages = $state(false);
  let ws: ChatWebSocket | null = null;
  let messagesContainer: HTMLDivElement;
  let shouldAutoScroll = $state(true);
  let showScrollButton = $state(false);
  
  // Edit state
  let editingMessageId: string | null = $state(null);
  let editingContent = $state('');
  
  // Hover state for message actions
  let hoveredMessageId: string | null = $state(null);
  
  // Thread state
  let openThreadId: string | null = $state(null);
  let threadPanelRef: any = null;
  
  // Reaction state
  let showEmojiPicker = $state(false);
  let emojiPickerMessageId: string | null = $state(null);
  
  // Signup form state (for first user)
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let signupError = $state('');
  let signingUp = $state(false);
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  
  onMount(async () => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    
    if (!token) {
      // Check if any users exist in the system
      try {
        const hasUsers = await checkHasUsers();
        if (hasUsers) {
          // Users exist, redirect to login
          goto('/login');
          return;
        } else {
          // No users exist, show admin signup
          isFirstUser = true;
          loading = false;
          return;
        }
      } catch (err) {
        console.error('Error checking if users exist:', err);
        // On error, default to showing login page (safer than exposing admin signup)
        goto('/login');
        return;
      }
    }
    
    try {
      user = await fetchCurrentUser();
      
      // Load channels
      channels = await fetchChannels();
      
      // Load messages for current channel
      await loadChannelMessages();
      
      // Connect to WebSocket
      connectWebSocket(token);
      
      loading = false;
    } catch (err) {
      console.error('Error loading user data:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      goto('/login');
    }
  });
  
  onDestroy(() => {
    if (ws) {
      ws.disconnect();
    }
  });
  
  function connectWebSocket(token: string) {
    ws = new ChatWebSocket(token);
    
    ws.on('authenticated', (event) => {
      console.log('WebSocket authenticated:', event.user);
    });
    
    ws.on('message.new', (event) => {
      if (event.message) {
        handleNewMessage(event.message);
      }
    });
    
    ws.on('message.updated', (event) => {
      if (event.message) {
        handleUpdatedMessage(event.message);
      }
    });
    
    ws.on('message.deleted', (event) => {
      if (event.messageId) {
        handleDeletedMessage(event.messageId);
      }
    });
    
    ws.on('thread.new', (event) => {
      if (event.message && event.parentId) {
        handleThreadReply(event.parentId, event.message);
      }
    });
    
    ws.on('reaction.added', (event) => {
      if (event.messageId && event.emoji && event.userId) {
        handleReactionAdded(event.messageId, event.emoji, event.userId);
      }
    });
    
    ws.on('reaction.removed', (event) => {
      if (event.messageId && event.emoji && event.userId) {
        handleReactionRemoved(event.messageId, event.emoji, event.userId);
      }
    });
    
    ws.on('error', (event) => {
      console.error('WebSocket error:', event);
    });
    
    ws.connect();
  }
  
  function handleNewMessage(message: Message) {
    // Only add if it's for the current channel and not already in the list
    if (message.channelId === currentChannel && !messages.find(m => m.id === message.id)) {
      messages = [...messages, message];
      
      // Auto-scroll if user was already at bottom
      if (shouldAutoScroll) {
        scrollToBottom();
      }
    }
  }
  
  function handleUpdatedMessage(message: Message) {
    messages = messages.map(m => m.id === message.id ? message : m);
  }
  
  function handleDeletedMessage(messageId: string) {
    messages = messages.filter(m => m.id !== messageId);
  }
  
  function handleThreadReply(parentId: string, reply: Message) {
    // Increment thread count for parent message
    messages = messages.map(m => {
      if (m.id === parentId) {
        return { ...m, threadCount: (m.threadCount || 0) + 1 };
      }
      return m;
    });
    
    // If thread panel is open for this message, add reply
    if (openThreadId === parentId && threadPanelRef) {
      try {
        if (typeof threadPanelRef.addReply === 'function') {
          threadPanelRef.addReply(reply);
        } else {
          console.warn('threadPanelRef.addReply is not a function', threadPanelRef);
        }
      } catch (err) {
        console.error('Error adding reply to thread panel:', err);
      }
    }
  }
  
  function handleReactionAdded(messageId: string, emoji: string, userId: string) {
    messages = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) {
          reactions[emoji] = [];
        }
        if (!reactions[emoji].includes(userId)) {
          reactions[emoji] = [...reactions[emoji], userId];
        }
        return { ...m, reactions };
      }
      return m;
    });
  }
  
  function handleReactionRemoved(messageId: string, emoji: string, userId: string) {
    messages = messages.map(m => {
      if (m.id === messageId) {
        const reactions = { ...m.reactions };
        if (reactions[emoji]) {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        }
        return { ...m, reactions };
      }
      return m;
    });
  }
  
  async function loadChannelMessages() {
    if (!currentChannel) return;
    
    loadingMessages = true;
    try {
      messages = await fetchMessages(currentChannel);
      // Reverse to show oldest first
      messages = messages.reverse();
      
      // Scroll to bottom after loading
      setTimeout(() => scrollToBottom(), 100);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      loadingMessages = false;
    }
  }
  
  async function switchChannel(channelId: string) {
    currentChannel = channelId;
    await loadChannelMessages();
  }
  
  async function handleSendMessage(e: Event) {
    e.preventDefault();
    
    if (!messageInput.trim() || sendingMessage) return;
    
    const content = messageInput.trim();
    messageInput = '';
    sendingMessage = true;
    
    try {
      const message = await sendMessage(currentChannel, content);
      // Message will be added via WebSocket event
    } catch (err: any) {
      console.error('Failed to send message:', err);
      alert('Failed to send message: ' + (err.message || 'Unknown error'));
      messageInput = content; // Restore message
    } finally {
      sendingMessage = false;
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  }
  
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      shouldAutoScroll = true;
      showScrollButton = false;
    }
  }
  
  function handleScroll() {
    if (!messagesContainer) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    shouldAutoScroll = isAtBottom;
    showScrollButton = !isAtBottom;
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
      await editMessage(editingMessageId, editingContent.trim());
      cancelEdit();
      // Message will be updated via WebSocket
    } catch (err: any) {
      alert('Failed to edit message: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleDelete(messageId: string) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
      await deleteMessage(messageId);
      // Message will be removed via WebSocket
    } catch (err: any) {
      alert('Failed to delete message: ' + (err.message || 'Unknown error'));
    }
  }
  
  function canEdit(message: Message): boolean {
    return user?.id === message.author.id;
  }
  
  function canDelete(message: Message): boolean {
    return user?.id === message.author.id || user?.role === 'admin';
  }
  
  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
  }
  
  function renderMarkdown(content: string): string {
    return marked(content, { breaks: true }) as string;
  }
  
  function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  
  // Thread functions
  function openThread(messageId: string) {
    openThreadId = messageId;
  }
  
  function closeThread() {
    openThreadId = null;
  }
  
  // Reaction functions
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
      // Reaction will be added via WebSocket
    } catch (err: any) {
      console.error('Failed to add reaction:', err);
      alert('Failed to add reaction: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleReactionClick(messageId: string, emoji: string) {
    const message = messages.find(m => m.id === messageId);
    if (!message || !user) return;
    
    // Check if user already reacted with this emoji
    const hasReacted = message.reactions[emoji]?.includes(user.id);
    
    try {
      if (hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
      // Reaction will be updated via WebSocket
    } catch (err: any) {
      console.error('Failed to toggle reaction:', err);
      alert('Failed to toggle reaction: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleFirstUserSignup(e: SubmitEvent) {
    e.preventDefault();
    
    signupError = '';
    signingUp = true;
    
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          displayName,
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        signupError = data.error || 'Signup failed';
        return;
      }
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      window.location.reload();
    } catch (err: any) {
      signupError = err.message || 'Network error';
    } finally {
      signingUp = false;
    }
  }
  
  async function handleLogout() {
    const token = localStorage.getItem('token');
    
    if (token) {
      try {
        await fetch(`${API_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    
    if (ws) {
      ws.disconnect();
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    goto('/login');
  }
</script>

{#if loading}
  <div class="flex min-h-screen items-center justify-center">
    <p class="text-gray-600">Loading...</p>
  </div>
{:else if isFirstUser}
  <!-- First user signup form -->
  <div class="flex min-h-screen items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-md">
      <div class="text-center">
        <h1 class="text-3xl font-bold text-gray-900">Welcome to Relay Chat</h1>
        <p class="mt-2 text-sm text-gray-600">Create the first admin account</p>
      </div>
      
      {#if signupError}
        <div class="rounded-md bg-red-50 p-4">
          <p class="text-sm text-red-800">{signupError}</p>
        </div>
      {/if}
      
      <form class="space-y-4" onsubmit={handleFirstUserSignup}>
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700">
            Username
          </label>
          <input
            id="username"
            type="text"
            bind:value={username}
            required
            minlength={3}
            maxlength={20}
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="admin"
          />
        </div>
        
        <div>
          <label for="displayName" class="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            bind:value={displayName}
            required
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Admin"
          />
        </div>
        
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            disabled={signingUp}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        
        <button
          type="submit"
          disabled={signingUp}
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingUp ? 'Creating account...' : 'Create Admin Account'}
        </button>
      </form>
    </div>
  </div>
{:else}
  <!-- Main chat interface -->
  <div class="flex h-screen bg-gray-50">
    <!-- Sidebar -->
    <aside class="w-60 border-r bg-white flex flex-col">
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold text-gray-900">Relay Chat</h2>
      </div>
      
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Channels</p>
        {#each channels as channel}
          <button
            onclick={() => switchChannel(channel.id)}
            class="block w-full text-left px-3 py-2 rounded-md text-sm {currentChannel === channel.id ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}"
          >
            # {channel.name}
          </button>
        {/each}
      </nav>
      
      <div class="border-t p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
              {user ? getInitials(user.displayName) : '?'}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{user?.displayName}</p>
              <p class="text-xs text-gray-500 truncate">@{user?.username}</p>
            </div>
          </div>
          <button
            onclick={handleLogout}
            class="text-gray-400 hover:text-gray-600"
            title="Logout"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
        
        {#if user?.role === 'admin'}
          <a href="/admin" class="mt-3 block text-center text-sm text-blue-600 hover:text-blue-700">
            Admin Panel
          </a>
        {/if}
        
        {#if user?.role === 'admin'}
          <a href="/settings" class="mt-2 block text-center text-sm text-gray-600 hover:text-gray-700">
            Settings
          </a>
        {/if}
      </div>
    </aside>

    <!-- Main chat area -->
    <main class="flex-1 flex flex-col">
      <header class="border-b bg-white px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold text-gray-900">
              # {channels.find(c => c.id === currentChannel)?.name || currentChannel}
            </h1>
            <p class="text-sm text-gray-500">
              {channels.find(c => c.id === currentChannel)?.description || ''}
            </p>
          </div>
        </div>
      </header>
      
      <div 
        bind:this={messagesContainer}
        onscroll={handleScroll}
        class="flex-1 overflow-y-auto p-6 space-y-4 relative"
      >
        {#if loadingMessages}
          <div class="text-center text-gray-500">
            <p class="text-sm">Loading messages...</p>
          </div>
        {:else if messages.length === 0}
          <div class="text-center text-gray-500">
            <p class="text-sm">No messages yet. Be the first to say something!</p>
          </div>
        {:else}
          {#each messages as message (message.id)}
            <div 
              class="flex gap-3 group"
              onmouseenter={() => hoveredMessageId = message.id}
              onmouseleave={() => hoveredMessageId = null}
            >
              <div class="flex-shrink-0">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
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
                  
                  <!-- Reactions -->
                  {#if Object.keys(message.reactions).length > 0}
                    <div class="flex flex-wrap gap-1 mt-2">
                      {#each Object.entries(message.reactions) as [emoji, userIds]}
                        <button
                          onclick={() => handleReactionClick(message.id, emoji)}
                          class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition-colors {userIds.includes(user?.id || '') ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}"
                          title="{userIds.length} reaction{userIds.length !== 1 ? 's' : ''}"
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
                  
                  <!-- Message actions (on hover) -->
                  {#if hoveredMessageId === message.id}
                    <div class="mt-2 flex gap-2">
                      <button
                        onclick={() => showEmojiPickerFor(message.id)}
                        class="text-xs text-gray-500 hover:text-gray-700"
                      >
                        🙂 React
                      </button>
                      <button
                        onclick={() => openThread(message.id)}
                        class="text-xs text-gray-500 hover:text-gray-700"
                      >
                        💬 Reply in thread
                      </button>
                      {#if canEdit(message)}
                        <button
                          onclick={() => startEdit(message)}
                          class="text-xs text-gray-500 hover:text-gray-700"
                        >
                          ✏️ Edit
                        </button>
                      {/if}
                      {#if canDelete(message)}
                        <button
                          onclick={() => handleDelete(message.id)}
                          class="text-xs text-red-500 hover:text-red-700"
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
            class="fixed bottom-24 right-8 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-all"
            title="Scroll to bottom"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        {/if}
      </div>
      
      <div class="border-t bg-white p-4">
        <form onsubmit={handleSendMessage}>
          <div class="flex gap-2">
            <textarea
              bind:value={messageInput}
              onkeydown={handleKeyDown}
              placeholder="Message #{channels.find(c => c.id === currentChannel)?.name || currentChannel}"
              disabled={sendingMessage}
              class="flex-1 rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
              rows="1"
            ></textarea>
            <button
              type="submit"
              disabled={sendingMessage || !messageInput.trim()}
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingMessage ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </main>
    
    <!-- Thread Panel -->
    {#if openThreadId}
      <ThreadPanel 
        bind:this={threadPanelRef}
        messageId={openThreadId} 
        onClose={closeThread}
        currentUserId={user?.id}
      />
    {/if}
  </div>
{/if}

<!-- Emoji Picker Modal -->
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
  
  :global(.prose a) {
    color: #2563eb;
    text-decoration: underline;
  }
  
  :global(.prose strong) {
    font-weight: 600;
  }
  
  :global(.prose em) {
    font-style: italic;
  }
</style>
