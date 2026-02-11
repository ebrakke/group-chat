<script lang="ts">
  import { marked } from 'marked';
  import { fetchThread, replyInThread, type Message } from '$lib/api';
  
  interface Props {
    messageId: string;
    onClose: () => void;
    currentUserId?: string;
  }
  
  let { messageId, onClose, currentUserId }: Props = $props();
  
  let loading = $state(true);
  let rootMessage: Message | null = $state(null);
  let replies: Message[] = $state([]);
  let replyInput = $state('');
  let alsoSendToChannel = $state(false);
  let sendingReply = $state(false);
  let error: string | null = $state(null);
  
  // Load thread when component mounts or messageId changes
  $effect(() => {
    if (messageId) {
      loadThread();
    }
  });
  
  async function loadThread() {
    loading = true;
    error = null;
    try {
      const thread = await fetchThread(messageId);
      rootMessage = thread.root;
      replies = thread.replies;
    } catch (err: any) {
      console.error('Failed to load thread:', err);
      error = err.message || 'Failed to load thread';
    } finally {
      loading = false;
    }
  }
  
  async function handleSendReply(e: Event) {
    e.preventDefault();
    
    if (!replyInput.trim() || sendingReply) return;
    
    const content = replyInput.trim();
    replyInput = '';
    sendingReply = true;
    error = null;
    
    try {
      const reply = await replyInThread(messageId, content, alsoSendToChannel);
      // Reply will be added via WebSocket event
      alsoSendToChannel = false;
    } catch (err: any) {
      console.error('Failed to send reply:', err);
      error = err.message || 'Failed to send reply';
      replyInput = content; // Restore message
    } finally {
      sendingReply = false;
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
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
  
  // Export function to add new reply (called from parent)
  // This method is exposed to the parent component via bind:this
  export function addReply(reply: Message) {
    // Only add if not already present (avoid duplicates)
    if (!replies.find(r => r.id === reply.id)) {
      replies = [...replies, reply];
    }
  }
</script>

<aside class="fixed inset-0 md:right-0 md:top-0 md:left-auto md:w-96 md:inset-y-0 h-screen bg-white md:border-l shadow-lg flex flex-col z-50">
  <!-- Header -->
  <header class="border-b px-4 py-3 flex items-center gap-3 bg-gray-50">
    <!-- Back button (mobile) / Close button (desktop) -->
    <button
      onclick={onClose}
      class="text-gray-600 hover:text-gray-900 transition-colors p-1 -ml-1"
      title="Close thread"
      aria-label="Close thread"
    >
      <svg class="w-6 h-6 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      <svg class="w-6 h-6 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    
    <h2 class="text-lg font-semibold text-gray-900 flex-1">Thread</h2>
  </header>
  
  <!-- Thread content -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if loading}
      <div class="text-center text-gray-500 py-8">
        <p class="text-sm">Loading thread...</p>
      </div>
    {:else if error}
      <div class="bg-red-50 border border-red-200 rounded-md p-4">
        <p class="text-sm text-red-800">{error}</p>
        <button
          onclick={loadThread}
          class="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    {:else}
      <!-- Root message -->
      {#if rootMessage}
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div class="flex gap-3">
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                {getInitials(rootMessage.author.displayName)}
              </div>
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-1">
                <span class="font-semibold text-gray-900">{rootMessage.author.displayName}</span>
                <span class="text-xs text-gray-500">{formatTimestamp(rootMessage.createdAt)}</span>
              </div>
              
              <div class="prose prose-sm max-w-none text-gray-800">
                {@html renderMarkdown(rootMessage.content)}
              </div>
            </div>
          </div>
        </div>
        
        <div class="text-xs text-gray-500 font-medium uppercase tracking-wide px-1">
          {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
        </div>
      {/if}
      
      <!-- Replies -->
      {#each replies as reply (reply.id)}
        <div class="flex gap-3">
          <div class="flex-shrink-0">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white text-xs font-medium">
              {getInitials(reply.author.displayName)}
            </div>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-1">
              <span class="font-semibold text-gray-900 text-sm">{reply.author.displayName}</span>
              <span class="text-xs text-gray-500">{formatTimestamp(reply.createdAt)}</span>
            </div>
            
            <div class="prose prose-sm max-w-none text-gray-800 text-sm">
              {@html renderMarkdown(reply.content)}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
  
  <!-- Reply input -->
  <div class="border-t bg-white p-3 md:p-4">
    <form onsubmit={handleSendReply} class="space-y-3">
      <textarea
        bind:value={replyInput}
        onkeydown={handleKeyDown}
        placeholder="Reply in thread..."
        disabled={sendingReply || loading}
        class="w-full rounded-md border border-gray-300 px-3 py-2.5 md:py-2 text-base md:text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
        rows="3"
      ></textarea>
      
      <div class="flex items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-xs md:text-sm text-gray-600 cursor-pointer min-h-[44px] md:min-h-0">
          <input
            type="checkbox"
            bind:checked={alsoSendToChannel}
            disabled={sendingReply || loading}
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5 md:w-4 md:h-4"
          />
          <span>Also send to channel</span>
        </label>
        
        <button
          type="submit"
          disabled={sendingReply || !replyInput.trim() || loading}
          class="px-3 md:px-4 py-2.5 md:py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium min-h-[44px] md:min-h-0"
        >
          {sendingReply ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  </div>
</aside>

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
