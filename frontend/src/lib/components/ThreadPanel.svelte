<script lang="ts">
  import { threadStore } from '$lib/stores/threads';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';

  let { onClose }: { onClose: () => void } = $props();

  let parentMessage = $derived(threadStore.parentMessage);
  let replies = $derived(threadStore.replies);
  let muted = $derived(threadStore.muted);

  async function handleSendReply(content: string) {
    if (!threadStore.openThreadId) return;
    try {
      await threadStore.sendReply(threadStore.openThreadId, content);
      await threadStore.loadReplies(threadStore.openThreadId);
    } catch {
      // ignore send errors
    }
  }

  function handleToggleMute() {
    threadStore.toggleMute();
  }
</script>

<div id="thread-panel" class="flex flex-col h-full bg-[#1e2024] border-l border-gray-700/40">
  <!-- Thread header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700/40 shrink-0">
    <h3 class="text-lg font-bold text-white">Thread</h3>
    <div class="flex items-center gap-2">
      <button
        onclick={handleToggleMute}
        class="text-gray-400 hover:text-white transition-colors text-lg"
        title={muted ? 'Unmute thread' : 'Mute thread'}
      >
        {#if muted}
          <span aria-label="Muted">&#128277;</span>
        {:else}
          <span aria-label="Notifications on">&#128276;</span>
        {/if}
      </button>
      <button
        id="close-thread"
        onclick={onClose}
        class="text-gray-400 hover:text-white transition-colors text-xl leading-none px-1"
        aria-label="Close thread"
      >
        &times;
      </button>
    </div>
  </div>

  <!-- Parent message -->
  {#if parentMessage}
    <div id="thread-parent" class="px-4 py-3 border-b border-gray-700/40 shrink-0">
      <div class="flex items-baseline gap-2">
        <span class="font-bold text-gray-100 text-sm">{parentMessage.displayName}</span>
        <span class="text-xs text-gray-500">{formatTime(parentMessage.createdAt)}</span>
      </div>
      <div class="prose prose-invert prose-sm max-w-none mt-1 break-words">
        {@html renderMarkdown(parentMessage.content)}
      </div>
    </div>
  {/if}

  <!-- Replies -->
  <div class="thread-replies flex-1 overflow-y-auto">
    {#if replies.length > 0}
      <MessageList messages={replies} />
    {:else}
      <div class="flex items-center justify-center h-full text-gray-500 text-sm">
        <p>No replies yet</p>
      </div>
    {/if}
  </div>

  <!-- Reply input -->
  <MessageInput
    onSend={handleSendReply}
    placeholder="Reply..."
    inputId="reply-input"
    sendButtonId="reply-send"
  />
</div>
