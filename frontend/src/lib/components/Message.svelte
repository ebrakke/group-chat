<script lang="ts">
  import type { Message } from '$lib/types';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import { authStore } from '$lib/stores/auth';
  import { messageStore } from '$lib/stores/messages';
  import { api } from '$lib/api';
  import { toastStore } from '$lib/stores/toast.svelte';
  import LinkPreview from './LinkPreview.svelte';
  import FilePreview from './FilePreview.svelte';
  import Avatar from './Avatar.svelte';
  import ProfileCard from './ProfileCard.svelte';

  let {
    message,
    onOpenThread,
    onReactionChange,
    grouped = false,
    compact = false
  }: {
    message: Message;
    onOpenThread?: (id: number) => void;
    onReactionChange?: () => void;
    grouped?: boolean;
    compact?: boolean;
  } = $props();

  let hovered = $state(false);
  let showPicker = $state(false);
  let showMoreMenu = $state(false);
  let showBottomSheet = $state(false);
  let bottomSheetReacting = $state(false);
  let pickerContainer: HTMLDivElement | undefined = $state();
  let reactBtnEl: HTMLButtonElement | undefined = $state();
  let editing = $state(false);
  let editText = $state('');
  let touchTimer: ReturnType<typeof setTimeout> | undefined;
  let showProfileCard = $state(false);
  let profileCardAnchorRect: DOMRect | null = $state(null);

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

  const COLLAPSE_WORD_LIMIT = 200;
  const COLLAPSED_HEIGHT = '300px';

  const currentUserId = $derived(authStore.user?.id ?? 0);
  const canEdit = $derived(currentUserId === message.userId);
  const canDelete = $derived(currentUserId === message.userId || authStore.user?.role === 'admin');
  const showActions = $derived(!!onOpenThread || canEdit || canDelete);
  const renderedContent = $derived(renderMarkdown(message.content));
  const hasReplies = $derived(message.replyCount && message.replyCount > 0);
  const isLong = $derived(message.content.trim().split(/\s+/).length > COLLAPSE_WORD_LIMIT);
  const isTouch = $derived(typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);
  let expanded = $state(false);

  // --- Desktop: click-outside to close picker/more menu ---
  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as Node;
    if (pickerContainer?.contains(target)) return;
    if (reactBtnEl?.contains(target)) return;
    showPicker = false;
    showMoreMenu = false;
  }

  $effect(() => {
    if (showPicker || showMoreMenu) {
      document.addEventListener('click', handleDocumentClick);
      return () => {
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  });

  // --- Desktop: click message body to open thread ---
  function handleClick(e: MouseEvent) {
    if (isTouch) return;
    if (!onOpenThread) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, textarea, .reaction-pill, .msg-actions, .reaction-picker')) return;
    onOpenThread(message.id);
  }

  // --- Mobile: long-press to open bottom sheet ---
  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, .reaction-pill')) return;
    touchTimer = setTimeout(() => {
      touchTimer = undefined;
      showBottomSheet = true;
    }, 500);
  }

  function handleTouchEnd() {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = undefined;
    }
  }

  function handleTouchMove() {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = undefined;
    }
  }

  function closeBottomSheet() {
    showBottomSheet = false;
    bottomSheetReacting = false;
  }

  // Lock body scroll while bottom sheet is open
  $effect(() => {
    if (showBottomSheet) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  });

  // --- Emoji picker positioning (desktop) ---
  let pickerStyle = $state('');

  $effect(() => {
    if (showPicker && reactBtnEl) {
      const rect = reactBtnEl.getBoundingClientRect();
      const pickerHeight = 120;
      const pickerWidth = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < pickerHeight + 10 && rect.top > pickerHeight + 10;
      const top = above ? rect.top - pickerHeight - 4 : rect.bottom + 4;
      const left = Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8);
      pickerStyle = `top: ${top}px; left: ${Math.max(8, left)}px;`;
    }
  });

  // --- Reactions ---
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
      toastStore.error('Failed to update reaction');
    }
    showPicker = false;
  }

  // --- Editing ---
  let editTextarea: HTMLTextAreaElement | undefined = $state();

  function startEdit() {
    editText = message.content;
    editing = true;
  }

  async function saveEdit() {
    if (!editText.trim() || editText === message.content) {
      editing = false;
      return;
    }
    try {
      await messageStore.editMessage(message.id, editText);
      editing = false;
    } catch {
      toastStore.error('Failed to edit message');
    }
  }

  function cancelEdit() {
    editing = false;
  }

  async function handleDelete() {
    if (!confirm('Delete this message?')) return;
    try {
      await messageStore.deleteMessage(message.id);
    } catch {
      toastStore.error('Failed to delete message');
    }
  }

  $effect(() => {
    if (editing && editTextarea) {
      editTextarea.focus();
    }
  });

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  function handleProfileClick(e: MouseEvent) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    profileCardAnchorRect = target.getBoundingClientRect();
    showProfileCard = true;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="message relative"
  style="padding-left: {compact ? '12px' : '20px'}; padding-right: {compact ? '12px' : '20px'}; margin-top: {grouped ? '1px' : compact ? '8px' : '16px'}; background: {hovered ? 'var(--rc-message-hover)' : 'transparent'}; {!isTouch && onOpenThread ? 'cursor: pointer;' : ''}"
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => { hovered = false; showMoreMenu = false; }}
  onclick={handleClick}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  ontouchmove={handleTouchMove}
>
  {#if !grouped}
    <!-- Header: avatar + timestamp + author -->
    <div class="flex items-center gap-2 pt-1">
      <span
        class="text-[11px] tabular-nums shrink-0 select-none w-9 self-baseline"
        style="color: var(--rc-timestamp);"
      >{formatTime(message.createdAt)}</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="cursor-pointer" onclick={handleProfileClick}>
        <Avatar url={message.avatarUrl} displayName={message.displayName} username={message.username} size={compact ? 28 : 36} />
      </span>
      <div class="flex items-baseline gap-1.5 min-w-0">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="text-[13px] font-bold truncate cursor-pointer hover:underline underline-offset-2" style="color: var(--foreground);"
              onclick={handleProfileClick}>
          {message.displayName}
        </span>
        {#if message.isBot}
          <span class="text-[9px] font-bold uppercase tracking-wide px-1 py-[1px] shrink-0"
                style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
        {/if}
        {#if message.editedAt}
          <span class="text-[10px] italic shrink-0" style="color: var(--rc-timestamp);">(edited)</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Desktop hover toolbar — floats top-right -->
  {#if !isTouch && showActions && (hovered || showPicker || showMoreMenu)}
    <div class="msg-actions absolute -top-3 flex items-center z-20 border"
         style="right: {compact ? '12px' : '20px'}; background: var(--background); border-color: var(--border);">
      {#if onOpenThread}
        <button
          bind:this={reactBtnEl}
          class="reaction-add-btn text-[15px] px-1.5 py-0.5 cursor-pointer hover:opacity-60"
          style="color: var(--rc-timestamp); background: transparent;"
          onclick={(e) => { e.stopPropagation(); showPicker = !showPicker; showMoreMenu = false; }}
          title="React"
        >&#x263A;</button>
        <button
          class="reply-btn text-[15px] px-1.5 py-0.5 cursor-pointer hover:opacity-60"
          style="color: var(--rc-timestamp); background: transparent;"
          onclick={(e) => { e.stopPropagation(); onOpenThread?.(message.id); }}
          title="Reply in thread"
        >&#x21A9;</button>
      {/if}
      {#if canEdit || canDelete}
        <div class="relative">
          <button
            class="text-[15px] px-1.5 py-0.5 cursor-pointer hover:opacity-60"
            style="color: var(--rc-timestamp); background: transparent;"
            onclick={(e) => { e.stopPropagation(); showMoreMenu = !showMoreMenu; showPicker = false; }}
            title="More actions"
          >&#x22EF;</button>
          {#if showMoreMenu}
            <div class="absolute right-0 top-full mt-1 border z-30 py-1 min-w-[80px]"
                 style="background: var(--background); border-color: var(--border);">
              {#if canEdit}
                <button class="block w-full text-left text-[12px] px-3 py-1.5 cursor-pointer hover:opacity-60"
                        style="color: var(--foreground);"
                        onclick={(e) => { e.stopPropagation(); startEdit(); showMoreMenu = false; }}>edit</button>
              {/if}
              {#if canDelete}
                <button class="block w-full text-left text-[12px] px-3 py-1.5 cursor-pointer hover:opacity-60"
                        style="color: var(--rc-destructive);"
                        onclick={(e) => { e.stopPropagation(); handleDelete(); showMoreMenu = false; }}>delete</button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Body — indented to align with author name -->
  <div
    class="text-[13px] leading-relaxed"
    style="color: var(--foreground); padding-left: {compact ? '76px' : '92px'}; padding-bottom: {grouped ? '1px' : compact ? '2px' : '4px'}; padding-top: {grouped ? '0' : '1px'};"
  >
    <!-- Content -->
    {#if editing}
      <textarea
        bind:this={editTextarea}
        bind:value={editText}
        onkeydown={handleEditKeydown}
        class="w-full bg-transparent outline-none resize-none font-mono text-[13px] border p-2"
        style="color: var(--foreground); border-color: var(--border);"
        rows="3"
      ></textarea>
      <div class="flex gap-2 mt-1">
        <button class="text-[11px] hover:underline cursor-pointer" style="color: var(--rc-olive);" onclick={saveEdit}>save</button>
        <button class="text-[11px] hover:underline cursor-pointer" style="color: var(--rc-timestamp);" onclick={cancelEdit}>cancel</button>
      </div>
    {:else}
      <div class="relative" style="{isLong && !expanded ? `max-height: ${COLLAPSED_HEIGHT}; overflow: hidden;` : ''}">
        <span class="msg-body break-words [&_p]:my-0 [&_a]:underline [&_a]:underline-offset-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:p-3 [&_pre]:my-1 [&_pre]:overflow-x-auto"
              style="color: var(--foreground); --tw-prose-links: var(--rc-link);">
          {@html renderedContent}
        </span>
        {#if isLong && !expanded}
          <div class="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
               style="background: linear-gradient(transparent, var(--background));"></div>
        {/if}
      </div>
      {#if isLong}
        <button
          class="text-[11px] mt-1 hover:underline underline-offset-2 cursor-pointer"
          style="color: var(--rc-olive);"
          onclick={() => (expanded = !expanded)}
        >{expanded ? 'show less' : 'show more'}</button>
      {/if}
    {/if}

    <!-- Link Previews -->
    {#if message.linkPreviews?.length}
      <div class="mt-1.5">
        {#each message.linkPreviews as preview (preview.url)}
          <LinkPreview {preview} />
        {/each}
      </div>
    {/if}

    <!-- File Attachments -->
    {#if message.files?.length}
      <div class="mt-1">
        {#each message.files as file (file.id)}
          <FilePreview {file} />
        {/each}
      </div>
    {/if}

    <!-- Reply count -->
    {#if hasReplies && onOpenThread}
      <div class="mt-1">
        <button
          class="reply-btn reply-count-btn text-[11px] hover:underline underline-offset-2 cursor-pointer"
          style="color: var(--rc-olive);"
          onclick={(e) => { e.stopPropagation(); onOpenThread?.(message.id); }}
        >({message.replyCount}) {message.replyCount === 1 ? 'reply' : 'replies'}</button>
      </div>
    {/if}

    <!-- Reactions -->
    {#if message.reactions?.length}
      <div class="flex flex-wrap items-center gap-1 mt-1">
        {#each message.reactions as reaction (reaction.emoji)}
          <button
            class="reaction-pill inline-flex items-center gap-1 px-2.5 py-1 text-[11px] border transition-colors"
            style="background: {reaction.userIds.includes(currentUserId) ? 'var(--rc-mention-bg)' : 'var(--rc-muted)'}; border-color: var(--border); color: var(--foreground);"
            onclick={(e) => { e.stopPropagation(); toggleReaction(reaction.emoji); }}
          >
            <span>{reaction.emoji}</span>
            <span class="reaction-count">{reaction.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Desktop emoji picker (fixed position, anchored to react button) -->
  {#if showPicker && !isTouch}
    <div
      bind:this={pickerContainer}
      class="reaction-picker fixed z-50 border p-2 flex flex-wrap gap-1 w-[220px]"
      style="background: var(--background); border-color: var(--border); {pickerStyle}"
    >
      {#each EMOJI_LIST as emoji}
        <button
          class="reaction-picker-btn text-2xl w-11 h-11 flex items-center justify-center hover:opacity-70 cursor-pointer"
          style="background: transparent;"
          onclick={(e) => { e.stopPropagation(); toggleReaction(emoji); }}
        >{emoji}</button>
      {/each}
    </div>
  {/if}
</div>

<!-- Profile Card -->
{#if showProfileCard && profileCardAnchorRect}
  <ProfileCard
    displayName={message.displayName}
    username={message.username}
    avatarUrl={message.avatarUrl}
    role={message.role}
    userCreatedAt={message.userCreatedAt}
    isBot={message.isBot}
    anchorRect={profileCardAnchorRect}
    onClose={() => (showProfileCard = false)}
  />
{/if}

<!-- Mobile bottom sheet (rendered outside message div for proper fixed positioning) -->
{#if showBottomSheet}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 bg-black/30" onclick={closeBottomSheet}></div>
  <div class="fixed bottom-0 left-0 right-0 z-50 border-t"
       style="background: var(--background); border-color: var(--border); padding-bottom: env(safe-area-inset-bottom);">
    <!-- Drag handle -->
    <div class="flex justify-center py-2">
      <div class="w-8 h-1 rounded-full" style="background: var(--border);"></div>
    </div>

    {#if !bottomSheetReacting}
      <div class="px-4 pb-4 flex flex-col gap-1">
        {#if onOpenThread}
          <button
            class="reply-btn text-left text-[13px] px-3 py-2.5 cursor-pointer"
            style="color: var(--foreground); background: transparent;"
            onclick={() => { onOpenThread?.(message.id); closeBottomSheet(); }}
          >reply in thread</button>
          <button
            class="reaction-add-btn text-left text-[13px] px-3 py-2.5 cursor-pointer"
            style="color: var(--foreground); background: transparent;"
            onclick={() => (bottomSheetReacting = true)}
          >react</button>
        {/if}
        {#if canEdit}
          <button class="text-left text-[13px] px-3 py-2.5 cursor-pointer"
                  style="color: var(--foreground); background: transparent;"
                  onclick={() => { startEdit(); closeBottomSheet(); }}>edit</button>
        {/if}
        {#if canDelete}
          <button class="text-left text-[13px] px-3 py-2.5 cursor-pointer"
                  style="color: var(--rc-destructive); background: transparent;"
                  onclick={() => { handleDelete(); closeBottomSheet(); }}>delete</button>
        {/if}
      </div>
    {:else}
      <div class="px-4 pb-4">
        <button class="text-[11px] mb-2 cursor-pointer hover:underline"
                style="color: var(--rc-timestamp);"
                onclick={() => (bottomSheetReacting = false)}>&larr; back</button>
        <div class="reaction-picker flex flex-wrap gap-2 justify-center">
          {#each EMOJI_LIST as emoji}
            <button
              class="reaction-picker-btn text-3xl w-14 h-14 flex items-center justify-center cursor-pointer hover:opacity-70"
              style="background: transparent;"
              onclick={() => { toggleReaction(emoji); closeBottomSheet(); }}
            >{emoji}</button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
