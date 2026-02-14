<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { marked } from 'marked';
  import { websocket } from '$lib/stores/websocket.svelte';
  import { replyInThread } from '$lib/api';
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
  
  // Replies state - needs to be mutable for WebSocket updates
  // Initialize from data.replies to ensure correct initial state
  let replies = $state<any[]>(data.replies);
  
  let replyInput = $state('');
  let sendingReply = $state(false);
  let alsoSendToChannel = $state(false);
  
  // Subscribe to new thread replies
  // Re-subscribes when threadId changes (cleanup runs automatically)
  $effect(() => {
    // Capture threadId to ensure effect re-runs when it changes
    const currentThreadId = $page.params.threadId;
    
    const handleThreadReply = (event: any) => {
      if (event.parentId === currentThreadId && event.message) {
        // Avoid duplicates
        if (!replies.find(r => r.id === event.message.id)) {
          replies = [...replies, event.message];
        }
      }
    };
    
    websocket.on('thread.new', handleThreadReply);
    
    return () => {
      websocket.off('thread.new', handleThreadReply);
    };
  });
  
  function closeThread() {
    goto(`/${$page.params.channel}`);
  }
  
  async function handleSendReply(e: SubmitEvent) {
    e.preventDefault();
    
    if (!replyInput.trim() || sendingReply) return;
    
    const content = replyInput.trim();
    sendingReply = true;
    
    // Optimistically clear input
    replyInput = '';
    
    try {
      await replyInThread($page.params.threadId, content, alsoSendToChannel);
      alsoSendToChannel = false;
      // Reply will be added via WebSocket
    } catch (err: any) {
      console.error('Failed to send reply:', err);
      // Restore input on error
      replyInput = content;
      alert('Failed to send reply: ' + (err.message || 'Unknown error'));
    } finally {
      sendingReply = false;
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e as any);
    }
  }
  
  function renderMarkdown(content: string): string {
    return marked(content, { breaks: true });
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
  
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
</script>

{#key $page.url.pathname}
<div class="flex flex-col h-full bg-white">
  <!-- Header -->
  <header class="border-b p-4 flex items-center gap-2">
    <button
      onclick={closeThread}
      class="p-2 hover:bg-gray-100 rounded-md -ml-2"
      aria-label="Back to channel"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <h2 class="text-lg font-semibold">Thread</h2>
  </header>
  
  <!-- Thread content -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4" data-testid="message-list">
    <!-- Parent message -->
    <div class="bg-gray-50 p-4 rounded-lg border">
      <p class="text-xs text-gray-500 mb-2 uppercase font-semibold">Original message</p>
      <div class="flex gap-3">
        <div class="flex-shrink-0">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
            {getInitials(data.parentMessage.author.displayName)}
          </div>
        </div>
        <div class="flex-1">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="font-semibold text-gray-900">{data.parentMessage.author.displayName}</span>
            <span class="text-xs text-gray-500">{formatTimestamp(data.parentMessage.createdAt)}</span>
          </div>
          <div class="prose prose-sm max-w-none text-gray-800">
            {@html renderMarkdown(data.parentMessage.content)}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Replies -->
    <div class="border-l-2 border-blue-500 pl-4 space-y-4">
      {#if replies.length === 0}
        <p class="text-sm text-gray-500">No replies yet. Be the first!</p>
      {:else}
        {#each replies as reply}
          <div class="flex gap-3">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                {getInitials(reply.author.displayName)}
              </div>
            </div>
            <div class="flex-1">
              <div class="flex items-baseline gap-2 mb-1">
                <span class="font-semibold text-gray-900">{reply.author.displayName}</span>
                <span class="text-xs text-gray-500">{formatTimestamp(reply.createdAt)}</span>
              </div>
              <div class="prose prose-sm max-w-none text-gray-800">
                {@html renderMarkdown(reply.content)}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
  
  <!-- Reply input -->
  <div class="border-t p-4">
    <form onsubmit={handleSendReply} class="space-y-3">
      <div>
        <textarea
          bind:value={replyInput}
          onkeydown={handleKeyDown}
          placeholder="Reply to thread..."
          disabled={sendingReply}
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 resize-none"
          rows="3"
        ></textarea>
      </div>
      
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            bind:checked={alsoSendToChannel}
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Also send to channel
        </label>
        
        <button
          type="submit"
          disabled={sendingReply || !replyInput.trim()}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {sendingReply ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  </div>
</div>
{/key}

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
