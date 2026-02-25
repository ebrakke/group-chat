<script lang="ts">
  import type { Message } from '$lib/types';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import { authStore } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import LinkPreview from './LinkPreview.svelte';

  let {
    message,
    onOpenThread,
    onReactionChange,
    grouped = false
  }: {
    message: Message;
    onOpenThread?: (id: number) => void;
    onReactionChange?: () => void;
    grouped?: boolean;
  } = $props();

  let showPicker = $state(false);
  let pickerContainer: HTMLDivElement | undefined = $state();
  let addBtnEl: HTMLButtonElement | undefined = $state();

  const EMOJI_LIST = [
    '\u{1F44D}',
    '\u{1F44E}',
    '\u{2764}\u{FE0F}',
    '\u{1F602}',
    '\u{1F62E}',
    '\u{1F622}',
    '\u{1F525}',
    '\u{1F389}',
    '\u{1F440}',
    '\u{1F64F}'
  ];

  const currentUserId = $derived(authStore.user?.id ?? 0);
  const renderedContent = $derived(renderMarkdown(message.content));
  const hasReplies = $derived(message.replyCount && message.replyCount > 0);

  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as Node;
    if (pickerContainer?.contains(target)) return;
    if (addBtnEl?.contains(target)) return;
    showPicker = false;
  }

  $effect(() => {
    if (showPicker) {
      document.addEventListener('click', handleDocumentClick);
      return () => {
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  });

  async function toggleReaction(emoji: string) {
    const existing = message.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = existing?.userIds.includes(currentUserId);

    try {
      if (hasReacted) {
        await api('DELETE', `/api/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`);
      } else {
        await api('POST', `/api/messages/${message.id}/reactions`, { emoji });
      }
      onReactionChange?.();
    } catch {
      // ignore
    }
    showPicker = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="message group relative px-4 hover:bg-white/[0.03] {grouped ? 'py-0.5' : 'mt-3 first:mt-0 pt-1.5 pb-0.5'}"
>
  <!-- Action buttons: floating toolbar on desktop hover, inline on mobile -->
  <div class="absolute -top-3 right-3 items-center gap-0.5 bg-gray-800 border border-gray-700 rounded-md px-0.5 py-0.5 shadow-lg z-10
    hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity duration-100">
    <button
      class="reply-btn p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs"
      onclick={() => onOpenThread?.(message.id)}
      title="Reply in thread"
    >
      {#if hasReplies}
        Reply ({message.replyCount})
      {:else}
        Reply
      {/if}
    </button>
    <div class="relative">
      <button
        bind:this={addBtnEl}
        class="reaction-add-btn p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs"
        onclick={() => (showPicker = !showPicker)}
        title="Add reaction"
      >+</button>
      {#if showPicker}
        <div
          bind:this={pickerContainer}
          class="reaction-picker absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl flex flex-wrap gap-1 w-[220px]"
        >
          {#each EMOJI_LIST as emoji}
            <button
              class="reaction-picker-btn text-xl hover:bg-gray-700 rounded w-10 h-10 flex items-center justify-center"
              onclick={() => toggleReaction(emoji)}
            >{emoji}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if !grouped}
    <!-- Header row: name + timestamp -->
    <div class="flex items-baseline gap-2">
      <span class="font-semibold text-[15px] text-gray-100 leading-tight">{message.displayName}</span>
      {#if message.isBot}
        <span class="text-[10px] font-bold bg-indigo-600 text-white px-1 py-0.5 rounded uppercase leading-none tracking-wide">BOT</span>
      {/if}
      <span class="text-[11px] text-gray-400">{formatTime(message.createdAt)}</span>
    </div>
  {/if}

  <!-- Content -->
  <div class="msg-body text-[15px] text-gray-200 leading-relaxed break-words [&_p]:my-0 [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_pre]:bg-gray-800/80 [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-1 [&_pre]:overflow-x-auto">
    {@html renderedContent}
  </div>

  <!-- Link Previews -->
  {#if message.linkPreviews?.length}
    <div class="mt-1">
      {#each message.linkPreviews as preview (preview.url)}
        <LinkPreview {preview} />
      {/each}
    </div>
  {/if}

  <!-- Mobile actions (visible, compact) -->
  <div class="flex md:hidden items-center gap-3 mt-0.5">
    {#if hasReplies}
      <button
        class="reply-btn text-xs text-blue-400 active:text-blue-300 py-0.5"
        onclick={() => onOpenThread?.(message.id)}
      >
        {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
      </button>
    {:else}
      <button
        class="reply-btn text-xs text-gray-500 active:text-gray-300 py-0.5"
        onclick={() => onOpenThread?.(message.id)}
      >
        Reply
      </button>
    {/if}
  </div>

  <!-- Reactions -->
  {#if message.reactions?.length}
    <div class="flex flex-wrap items-center gap-1 mt-1">
      {#each message.reactions as reaction (reaction.emoji)}
        <button
          class="reaction-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors {reaction.userIds.includes(currentUserId)
            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'}"
          onclick={() => toggleReaction(reaction.emoji)}
        >
          <span>{reaction.emoji}</span>
          <span class="reaction-count">{reaction.count}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
