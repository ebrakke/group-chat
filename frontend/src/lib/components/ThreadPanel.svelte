<script lang="ts">
  import { threadStore } from '$lib/stores/threads';
  import { uploadFile } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';

  let { onClose }: { onClose: () => void } = $props();

  let parentMessage = $derived(threadStore.parentMessage);
  let replies = $derived(threadStore.replies);
  let muted = $derived(threadStore.muted);

  // --- Resizable width ---
  let panelWidth = $state(320);
  let resizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      panelWidth = Math.max(240, Math.min(600, startWidth + delta));
    }

    function onUp() {
      resizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  async function handleSendReply(content: string, files?: File[]) {
    if (!threadStore.openThreadId) return;
    try {
      // Always send a reply if there's content or files (files need a message to attach to)
      const replyContent = content || (files?.length ? files.map(f => f.name).join(', ') : '');
      if (replyContent) {
        await threadStore.sendReply(threadStore.openThreadId, replyContent);
      }
      if (files?.length) {
        // Reload to get the reply ID for file attachment
        await threadStore.loadReplies(threadStore.openThreadId);
        const replyMsgs = threadStore.replies;
        const lastReply = replyMsgs[replyMsgs.length - 1];
        if (lastReply) {
          for (const f of files) {
            await uploadFile(f, lastReply.id);
          }
        }
      }
      await threadStore.loadReplies(threadStore.openThreadId);
    } catch {
      toastStore.error('Failed to send reply');
    }
  }

  function handleToggleMute() {
    threadStore.toggleMute();
  }
</script>

<div id="thread-panel" class="flex h-full w-full md:shrink-0"
     style="max-width: 100%; --thread-w: {panelWidth}px;">
  <!-- Resize handle (desktop only) -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hidden md:block w-[3px] shrink-0 cursor-col-resize border-l hover:border-l-2 transition-colors"
    style="border-color: {resizing ? 'var(--rc-timestamp)' : 'var(--border)'};"
    onmousedown={startResize}
  ></div>

  <!-- Panel content -->
  <div class="flex flex-col flex-1 min-w-0"
       style="background: var(--rc-thread-bg);">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-3 border-b shrink-0"
         style="border-color: var(--border);">
      <span class="text-[10px] uppercase tracking-[0.14em]"
            style="color: var(--rc-timestamp);">thread</span>
      <div class="flex items-center gap-3">
        <button
          onclick={handleToggleMute}
          class="text-[12px] hover:underline underline-offset-2 px-1.5 py-1"
          style="color: var(--rc-timestamp);"
          title={muted ? 'Unmute thread' : 'Mute thread'}
        >{muted ? 'unmute' : 'mute'}</button>
        <button
          id="close-thread"
          onclick={onClose}
          class="text-[18px] leading-none hover:opacity-60 p-1"
          style="color: var(--rc-timestamp);"
          aria-label="Close thread"
        >&times;</button>
      </div>
    </div>

    <!-- Parent message -->
    {#if parentMessage}
      <div id="thread-parent" class="px-3 pt-3 pb-2">
        <div class="flex items-baseline gap-2 mb-0.5">
          <span class="text-[11px] tabular-nums w-9 shrink-0"
                style="color: var(--rc-timestamp);">{formatTime(parentMessage.createdAt)}</span>
          <span class="text-[13px] font-bold"
                style="color: var(--foreground);">{parentMessage.displayName}</span>
        </div>
        <div class="text-[13px] leading-relaxed break-words [&_p]:my-0 [&_a]:underline [&_a]:underline-offset-2"
             style="color: var(--foreground); padding-left: 44px;">
          {@html renderMarkdown(parentMessage.content)}
        </div>
      </div>
    {/if}

    <!-- Divider -->
    <div class="flex items-center gap-2 px-3 py-1.5">
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
        <MessageList messages={replies} compact />
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
</div>

<style>
  @media (min-width: 768px) {
    #thread-panel {
      width: var(--thread-w);
    }
  }
</style>
