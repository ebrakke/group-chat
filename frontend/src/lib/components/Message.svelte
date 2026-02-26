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

  let hovered = $state(false);
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
  class="message relative px-5"
  style="margin-top: {grouped ? '2px' : '16px'}; background: {hovered ? 'var(--rc-message-hover)' : 'transparent'};"
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
>
  {#if !grouped}
    <!-- Header: timestamp + author + hover actions -->
    <div class="flex items-baseline gap-2 pt-1">
      <span
        class="text-[11px] tabular-nums shrink-0 select-none w-9"
        style="color: var(--rc-timestamp);"
      >{formatTime(message.createdAt)}</span>
      <span class="text-[13px] font-bold" style="color: var(--foreground);">
        {message.displayName}
      </span>
      {#if message.isBot}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1 py-[1px]"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
      {/if}
      {#if onOpenThread}
        <div class="ml-auto flex items-center gap-4 shrink-0" style="opacity: {hovered ? '1' : '0'}; transition: opacity 0.1s;">
          <button
            class="reply-btn text-[11px] cursor-pointer hover:underline underline-offset-2"
            style="color: var(--rc-timestamp);"
            onclick={() => onOpenThread?.(message.id)}
          >reply</button>
          <button
            bind:this={addBtnEl}
            class="reaction-add-btn text-[11px] cursor-pointer hover:underline underline-offset-2"
            style="color: var(--rc-timestamp);"
            onclick={() => (showPicker = !showPicker)}
          >react</button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Grouped hover actions — positioned absolutely so they don't affect text layout -->
  {#if grouped && onOpenThread}
    <div class="absolute right-5 top-0 bottom-0 flex items-center gap-4" style="opacity: {hovered ? '1' : '0'}; transition: opacity 0.1s;">
      <button
        class="reply-btn text-[11px] cursor-pointer hover:underline underline-offset-2"
        style="color: var(--rc-timestamp);"
        onclick={() => onOpenThread?.(message.id)}
      >reply</button>
      <button
        bind:this={addBtnEl}
        class="reaction-add-btn text-[11px] cursor-pointer hover:underline underline-offset-2"
        style="color: var(--rc-timestamp);"
        onclick={() => (showPicker = !showPicker)}
      >react</button>
    </div>
  {/if}

  <!-- Body — indented to align with author name -->
  <div
    class="text-[13px] leading-relaxed"
    style="color: var(--foreground); padding-left: 52px; padding-bottom: {grouped ? '1px' : '4px'}; padding-top: {grouped ? '0' : '1px'};"
  >
    <!-- Content -->
    <span class="msg-body break-words [&_p]:my-0 [&_a]:underline [&_a]:underline-offset-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:p-3 [&_pre]:my-1 [&_pre]:overflow-x-auto"
          style="color: var(--foreground); --tw-prose-links: var(--rc-link);">
      {@html renderedContent}
    </span>

    <!-- Link Previews -->
    {#if message.linkPreviews?.length}
      <div class="mt-1.5">
        {#each message.linkPreviews as preview (preview.url)}
          <LinkPreview {preview} />
        {/each}
      </div>
    {/if}

    <!-- Reply count -->
    {#if hasReplies && onOpenThread}
      <div class="mt-1">
        <button
          class="reply-btn text-[11px] hover:underline underline-offset-2 cursor-pointer"
          style="color: var(--rc-olive);"
          onclick={() => onOpenThread?.(message.id)}
        >({message.replyCount}) {message.replyCount === 1 ? 'reply' : 'replies'}</button>
      </div>
    {/if}

    <!-- Reactions -->
    {#if message.reactions?.length}
      <div class="flex flex-wrap items-center gap-1 mt-1">
        {#each message.reactions as reaction (reaction.emoji)}
          <button
            class="reaction-pill inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border transition-colors"
            style="background: {reaction.userIds.includes(currentUserId) ? 'var(--rc-mention-bg)' : 'var(--rc-muted)'}; border-color: var(--border); color: var(--foreground);"
            onclick={() => toggleReaction(reaction.emoji)}
          >
            <span>{reaction.emoji}</span>
            <span class="reaction-count">{reaction.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Emoji picker -->
  {#if showPicker}
    <div
      bind:this={pickerContainer}
      class="reaction-picker absolute right-5 top-full mt-1 z-50 border p-2 flex flex-wrap gap-1 w-[220px]"
      style="background: var(--background); border-color: var(--border);"
    >
      {#each EMOJI_LIST as emoji}
        <button
          class="reaction-picker-btn text-xl w-10 h-10 flex items-center justify-center hover:opacity-70"
          style="background: transparent;"
          onclick={() => toggleReaction(emoji)}
        >{emoji}</button>
      {/each}
    </div>
  {/if}
</div>
