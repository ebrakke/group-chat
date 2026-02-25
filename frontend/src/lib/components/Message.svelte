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
    onReactionChange
  }: {
    message: Message;
    onOpenThread?: (id: number) => void;
    onReactionChange?: () => void;
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

  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as Node;
    // If click is inside the picker or on the add button, ignore
    if (pickerContainer?.contains(target)) return;
    if (addBtnEl?.contains(target)) return;
    showPicker = false;
  }

  // Add/remove document click listener when picker opens/closes
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
      // ignore reaction errors
    }
    showPicker = false;
  }

  function handlePickerEmoji(emoji: string) {
    toggleReaction(emoji);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="message group px-4 py-2 hover:bg-gray-800/50 transition-colors"
>
  <!-- Header -->
  <div class="flex items-baseline gap-2">
    <span class="font-bold text-gray-100 text-sm">{message.displayName}</span>
    {#if message.isBot}
      <span
        class="text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase leading-none"
        >BOT</span
      >
    {/if}
    <span class="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
  </div>

  <!-- Content -->
  <div class="msg-body prose prose-invert prose-sm max-w-none mt-0.5 break-words">
    {@html renderedContent}
  </div>

  <!-- Link Previews -->
  {#if message.linkPreviews?.length}
    {#each message.linkPreviews as preview (preview.url)}
      <LinkPreview {preview} />
    {/each}
  {/if}

  <!-- Reactions bar -->
  {#if message.reactions?.length || true}
    <div class="flex flex-wrap items-center gap-1.5 mt-1.5 relative">
      {#if message.reactions?.length}
        {#each message.reactions as reaction (reaction.emoji)}
          <button
            class="reaction-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors {reaction.userIds.includes(
              currentUserId
            )
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}"
            onclick={() => toggleReaction(reaction.emoji)}
          >
            <span>{reaction.emoji}</span>
            <span class="reaction-count">{reaction.count}</span>
          </button>
        {/each}
      {/if}

      <button
        bind:this={addBtnEl}
        class="reaction-add-btn text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded px-1.5 py-0.5 text-xs transition-colors"
        onclick={() => (showPicker = !showPicker)}
        title="Add reaction"
      >
        +
      </button>

      <!-- Reaction picker -->
      {#if showPicker}
        <div
          bind:this={pickerContainer}
          class="reaction-picker absolute left-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl grid grid-cols-5 gap-1"
        >
          {#each EMOJI_LIST as emoji}
            <button
              class="reaction-picker-btn text-lg hover:bg-gray-700 rounded p-1 transition-colors"
              onclick={() => handlePickerEmoji(emoji)}
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Reply button -->
  <button
    class="reply-btn text-xs mt-1 transition-colors {message.replyCount && message.replyCount > 0
      ? 'text-blue-400 hover:text-blue-300'
      : 'text-gray-500 hover:text-gray-300'}"
    onclick={() => onOpenThread?.(message.id)}
  >
    {#if message.replyCount && message.replyCount > 0}
      Reply ({message.replyCount})
    {:else}
      Reply
    {/if}
  </button>
</div>
