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

<div id="thread-panel" class="flex flex-col h-full w-full md:w-[272px] shrink-0 border-l"
     style="background: var(--rc-thread-bg); border-color: var(--border);">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b shrink-0"
       style="border-color: var(--border);">
    <span class="text-[10px] uppercase tracking-[0.14em]"
          style="color: var(--rc-timestamp);">thread</span>
    <div class="flex items-center gap-3">
      <button
        onclick={handleToggleMute}
        class="text-[11px] hover:underline underline-offset-2"
        style="color: var(--rc-timestamp);"
        title={muted ? 'Unmute thread' : 'Mute thread'}
      >{muted ? 'unmute' : 'mute'}</button>
      <button
        id="close-thread"
        onclick={onClose}
        class="text-[16px] leading-none hover:opacity-60"
        style="color: var(--rc-timestamp);"
        aria-label="Close thread"
      >&times;</button>
    </div>
  </div>

  <!-- Parent message -->
  {#if parentMessage}
    <div id="thread-parent" class="px-4 pt-4 pb-3">
      <div class="flex items-baseline gap-2 mb-1">
        <span class="text-[11px] tabular-nums w-9 shrink-0"
              style="color: var(--rc-timestamp);">{formatTime(parentMessage.createdAt)}</span>
        <span class="text-[13px] font-bold"
              style="color: var(--foreground);">{parentMessage.displayName}</span>
      </div>
      <div class="text-[13px] leading-relaxed break-words [&_p]:my-0 [&_a]:underline [&_a]:underline-offset-2"
           style="color: var(--foreground); padding-left: 52px;">
        {@html renderMarkdown(parentMessage.content)}
      </div>
    </div>
  {/if}

  <!-- Divider -->
  <div class="flex items-center gap-2 px-4 py-2">
    <div class="flex-1 border-t" style="border-color: var(--border);"></div>
    <span class="text-[10px] uppercase tracking-[0.1em] shrink-0"
          style="color: var(--rc-divider-label);">
      {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'no replies yet'}
    </span>
    <div class="flex-1 border-t" style="border-color: var(--border);"></div>
  </div>

  <!-- Replies -->
  <div class="thread-replies flex-1 overflow-y-auto min-h-0">
    {#if replies.length > 0}
      <MessageList messages={replies} />
    {:else}
      <div class="flex items-center justify-center h-full text-[12px]"
           style="color: var(--rc-timestamp);">
        <p>No replies yet</p>
      </div>
    {/if}
  </div>

  <!-- Reply input -->
  <MessageInput
    onSend={handleSendReply}
    placeholder="reply..."
    inputId="reply-input"
    sendButtonId="reply-send"
  />
</div>
