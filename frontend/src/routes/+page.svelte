<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { fetchChannels, fetchMessages, sendMessage, editMessage, deleteMessage, fetchCurrentUser, checkHasUsers, addReaction, removeReaction, type Message, type Channel, type User, type UploadResult } from '$lib/api';
  import { ChatWebSocket } from '$lib/websocket';
  import ThreadPanel from '$lib/components/ThreadPanel.svelte';
  import EmojiPicker from '$lib/components/EmojiPicker.svelte';
  import FileUpload from '$lib/components/FileUpload.svelte';
  import ChannelModal from '$lib/components/ChannelModal.svelte';
  import ImageModal from '$lib/components/ImageModal.svelte';
  import { formatTimestamp, getInitials, formatFileSize, isImage } from '$lib/utils/formatting';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { SCROLL_THRESHOLD } from '$lib/utils/constants';
  import { showError, showSuccess } from '$lib/stores/notifications';
  
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
  
  // File upload state
  let attachments: UploadResult[] = $state([]);
  
  // Channel management state
  let showChannelModal = $state(false);
  let channelModalMode: 'create' | 'edit' = $state('create');
  let selectedChannel: Channel | null = $state(null);
  let showChannelMenu = $state(false);
  
  // Mobile state
  let sidebarOpen = $state(false);
  let showMessageActions: string | null = $state(null);
  
  // Image modal state
  let showImageModal = $state(false);
  let imageModalUrl = $state('');
  let imageModalFilename = $state('');
  
  // Signup form state (for first user)
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let signupError = $state('');
  let signingUp = $state(false);
  
  const API_URL = import.meta.env.VITE_API_URL || '';
  
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
    
    ws.on('channel.created', (event) => {
      if (event.channel) {
        handleChannelCreated(event.channel);
      }
    });
    
    ws.on('channel.updated', (event) => {
      if (event.channel) {
        handleChannelUpdated(event.channel);
      }
    });
    
    ws.on('channel.deleted', (event) => {
      if (event.channelId) {
        handleChannelDeleted(event.channelId);
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
  
  function handleChannelCreated(channel: Channel) {
    if (!channels.find(c => c.id === channel.id)) {
      channels = [...channels, channel];
    }
  }
  
  function handleChannelUpdated(channel: Channel) {
    channels = channels.map(c => c.id === channel.id ? channel : c);
    // Update selected channel if it's being edited
    if (selectedChannel && selectedChannel.id === channel.id) {
      selectedChannel = channel;
    }
  }
  
  function handleChannelDeleted(channelId: string) {
    channels = channels.filter(c => c.id !== channelId);
    // If current channel was deleted, switch to general
    if (currentChannel === channelId) {
      switchChannel('general');
    }
  }
  
  function openCreateChannelModal() {
    channelModalMode = 'create';
    selectedChannel = null;
    showChannelModal = true;
  }
  
  function openEditChannelModal() {
    const channel = channels.find(c => c.id === currentChannel);
    if (channel) {
      channelModalMode = 'edit';
      selectedChannel = channel;
      showChannelModal = true;
    }
  }
  
  function handleChannelModalSuccess(channel: Channel) {
    // Channel updates will come via WebSocket
    if (channelModalMode === 'create') {
      switchChannel(channel.id);
    }
  }
  
  function handleChannelDelete(channelId: string) {
    // Channel deletion will be handled via WebSocket
  }
  
  function openImageModal(url: string, filename: string) {
    imageModalUrl = url;
    imageModalFilename = filename;
    showImageModal = true;
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
    sidebarOpen = false; // Close sidebar on mobile when switching channels
    await loadChannelMessages();
  }
  
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
  
  function closeSidebar() {
    sidebarOpen = false;
  }
  
  async function handleSendMessage(e: Event) {
    e.preventDefault();
    
    if ((!messageInput.trim() && attachments.length === 0) || sendingMessage) return;
    
    const content = messageInput.trim() || '📎 Attachment';
    const messageAttachments = attachments.filter(a => !a.uploading && !a.error);
    
    messageInput = '';
    attachments = [];
    sendingMessage = true;
    
    try {
      const message = await sendMessage(currentChannel, content, messageAttachments);
      // Message will be added via WebSocket event
    } catch (err: any) {
      console.error('Failed to send message:', err);
      showError('Failed to send message: ' + (err.message || 'Unknown error'));
      messageInput = content !== '📎 Attachment' ? content : ''; // Restore message
      attachments = messageAttachments; // Restore attachments
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
    const isAtBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
    
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
      showError('Failed to edit message: ' + (err.message || 'Unknown error'));
    }
  }
  
  async function handleDelete(messageId: string) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
      await deleteMessage(messageId);
      // Message will be removed via WebSocket
    } catch (err: any) {
      showError('Failed to delete message: ' + (err.message || 'Unknown error'));
    }
  }
  
  function canEdit(message: Message): boolean {
    return user?.id === message.author.id;
  }
  
  function canDelete(message: Message): boolean {
    return user?.id === message.author.id || user?.role === 'admin';
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
      showError('Failed to add reaction: ' + (err.message || 'Unknown error'));
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
      showError('Failed to toggle reaction: ' + (err.message || 'Unknown error'));
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
  <div class="flex min-h-dvh items-center justify-center">
    <p class="text-gray-600">Loading...</p>
  </div>
{:else if isFirstUser}
  <!-- First user signup form -->
  <div class="flex min-h-dvh items-center justify-center bg-gray-50">
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
  <div class="flex h-dvh bg-gray-50">
    <!-- Mobile backdrop -->
    {#if sidebarOpen}
      <div 
        class="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
        onclick={closeSidebar}
      ></div>
    {/if}
    
    <!-- Sidebar -->
    <aside class="
      w-60 border-r bg-white flex flex-col
      fixed md:static inset-y-0 left-0 z-30
      transform transition-transform duration-300 ease-in-out
      {sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    ">
      <div class="p-4 border-b">
        <h2 class="text-lg font-semibold text-gray-900">Relay Chat</h2>
      </div>
      
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-semibold text-gray-500 uppercase">Channels</p>
          <button
            onclick={openCreateChannelModal}
            class="text-gray-500 hover:text-gray-700"
            title="Create channel"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
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
    <main class="flex-1 flex flex-col w-full md:w-auto">
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
              # {channels.find(c => c.id === currentChannel)?.name || currentChannel}
            </h1>
            <p class="text-sm text-gray-500 truncate hidden md:block">
              {channels.find(c => c.id === currentChannel)?.description || ''}
            </p>
          </div>
          <div class="relative">
            <button
              onclick={() => showChannelMenu = !showChannelMenu}
              class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Channel options"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {#if showChannelMenu}
              <div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border z-10">
                <button
                  onclick={() => { openEditChannelModal(); showChannelMenu = false; }}
                  class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Edit channel
                </button>
                {#if currentChannel !== 'general'}
                  <button
                    onclick={() => { openEditChannelModal(); showChannelMenu = false; }}
                    class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                  >
                    Delete channel
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </header>
      
      <div 
        bind:this={messagesContainer}
        onscroll={handleScroll}
        class="flex-1 overflow-y-auto p-3 md:p-6 space-y-3 md:space-y-4 relative"
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
              class="flex gap-2 md:gap-3 group"
              onmouseenter={() => hoveredMessageId = message.id}
              onmouseleave={() => hoveredMessageId = null}
              onclick={(e) => {
                // On mobile, tap to show/hide actions
                if (window.innerWidth < 768 && e.target === e.currentTarget) {
                  showMessageActions = showMessageActions === message.id ? null : message.id;
                }
              }}
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
                          <button
                            onclick={() => openImageModal(attachment.url, attachment.filename)}
                            class="block w-full md:w-auto"
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.filename}
                              class="w-full md:max-w-md rounded-lg border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              loading="lazy"
                            />
                          </button>
                        {:else}
                          <a
                            href={attachment.url}
                            download={attachment.filename}
                            class="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 border"
                          >
                            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <div class="text-left">
                              <p class="text-sm font-medium text-gray-900">{attachment.filename}</p>
                              <p class="text-xs text-gray-500">{formatFileSize(attachment.size)}</p>
                            </div>
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
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
                  
                  <!-- Message actions (on hover for desktop, on tap for mobile) -->
                  {#if hoveredMessageId === message.id || showMessageActions === message.id}
                    <div class="mt-2 flex flex-wrap gap-1 md:gap-2">
                      <button
                        onclick={(e) => { e.stopPropagation(); showEmojiPickerFor(message.id); }}
                        class="text-xs md:text-xs px-2 py-1.5 md:px-0 md:py-0 text-gray-500 hover:text-gray-700 bg-gray-100 md:bg-transparent rounded md:rounded-none min-h-[44px] md:min-h-0 flex items-center"
                      >
                        🙂 React
                      </button>
                      <button
                        onclick={(e) => { e.stopPropagation(); openThread(message.id); }}
                        class="text-xs md:text-xs px-2 py-1.5 md:px-0 md:py-0 text-gray-500 hover:text-gray-700 bg-gray-100 md:bg-transparent rounded md:rounded-none min-h-[44px] md:min-h-0 flex items-center"
                      >
                        💬 Reply
                      </button>
                      {#if canEdit(message)}
                        <button
                          onclick={(e) => { e.stopPropagation(); startEdit(message); }}
                          class="text-xs md:text-xs px-2 py-1.5 md:px-0 md:py-0 text-gray-500 hover:text-gray-700 bg-gray-100 md:bg-transparent rounded md:rounded-none min-h-[44px] md:min-h-0 flex items-center"
                        >
                          ✏️ Edit
                        </button>
                      {/if}
                      {#if canDelete(message)}
                        <button
                          onclick={(e) => { e.stopPropagation(); handleDelete(message.id); }}
                          class="text-xs md:text-xs px-2 py-1.5 md:px-0 md:py-0 text-red-500 hover:text-red-700 bg-red-50 md:bg-transparent rounded md:rounded-none min-h-[44px] md:min-h-0 flex items-center"
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
            class="fixed bottom-20 md:bottom-24 right-4 md:right-8 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 transition-all z-10"
            title="Scroll to bottom"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        {/if}
      </div>
      
      <div class="border-t bg-white p-3 md:p-4">
        <form onsubmit={handleSendMessage} class="relative">
          <FileUpload
            bind:attachments={attachments}
            onAttachmentsChange={(newAttachments) => {
              attachments = newAttachments;
            }}
          />
          <div class="flex gap-2 items-end">
            <div class="flex-1">
              <textarea
                bind:value={messageInput}
                onkeydown={handleKeyDown}
                placeholder="Message #{channels.find(c => c.id === currentChannel)?.name || currentChannel}"
                disabled={sendingMessage}
                class="w-full rounded-md border border-gray-300 px-3 md:px-4 py-2.5 md:py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
                rows="1"
              ></textarea>
            </div>
            <button
              type="submit"
              disabled={sendingMessage || (!messageInput.trim() && attachments.length === 0)}
              class="px-3 md:px-4 py-2.5 md:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px] md:min-h-0"
            >
              {sendingMessage ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-1 hidden md:block">
            Press Enter to send, Shift+Enter for new line. Drag & drop or paste files to attach.
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

<!-- Channel Modal -->
<ChannelModal
  bind:isOpen={showChannelModal}
  bind:mode={channelModalMode}
  bind:channel={selectedChannel}
  onSuccess={handleChannelModalSuccess}
  onDelete={handleChannelDelete}
/>

<!-- Image Modal -->
<ImageModal
  bind:isOpen={showImageModal}
  bind:imageUrl={imageModalUrl}
  bind:filename={imageModalFilename}
/>

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
