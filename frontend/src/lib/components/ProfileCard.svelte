<script lang="ts">
  import Avatar from './Avatar.svelte';

  let {
    displayName,
    username,
    avatarUrl,
    role,
    userCreatedAt,
    isBot = false,
    anchorRect,
    onClose
  }: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
    userCreatedAt?: string;
    isBot?: boolean;
    anchorRect: DOMRect;
    onClose: () => void;
  } = $props();

  const cardHeight = 200;
  const cardWidth = 250;

  let style = $derived.by(() => {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const above = spaceBelow < cardHeight + 10 && anchorRect.top > cardHeight + 10;
    const top = above ? anchorRect.top - cardHeight - 4 : anchorRect.bottom + 4;
    const left = Math.min(anchorRect.left, window.innerWidth - cardWidth - 8);
    return `top: ${top}px; left: ${Math.max(8, left)}px; width: ${cardWidth}px;`;
  });

  function formatJoinDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  function handleClickOutside(e: MouseEvent) {
    onClose();
  }

  $effect(() => {
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="profile-card fixed z-50 border rounded-lg p-4"
  style="background: var(--background); border-color: var(--border); {style}"
  onclick={(e) => e.stopPropagation()}
>
  <div class="flex flex-col items-center text-center gap-2">
    <Avatar url={avatarUrl} displayName={displayName} username={username} size={80} />
    <div>
      <div class="text-[14px] font-bold" style="color: var(--foreground);">{displayName}</div>
      {#if username}
        <div class="text-[12px]" style="color: var(--rc-timestamp);">@{username}</div>
      {/if}
    </div>
    <div class="flex items-center gap-1.5">
      {#if isBot}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
      {/if}
      {#if role === 'admin'}
        <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded"
              style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">ADMIN</span>
      {/if}
    </div>
    {#if userCreatedAt}
      <div class="text-[11px]" style="color: var(--rc-timestamp);">
        member since {formatJoinDate(userCreatedAt)}
      </div>
    {/if}
  </div>
</div>
