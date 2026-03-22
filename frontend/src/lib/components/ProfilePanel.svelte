<script lang="ts">
  import Avatar from './Avatar.svelte';

  let {
    displayName,
    username,
    avatarUrl,
    role,
    userCreatedAt,
    isBot = false,
    onClose,
    onMessage
  }: {
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
    userCreatedAt?: string;
    isBot?: boolean;
    onClose: () => void;
    onMessage?: () => void;
  } = $props();

  // --- Resizable width ---
  let panelWidth = $state(280);
  let resizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      panelWidth = Math.max(240, Math.min(400, startWidth + delta));
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

  function formatJoinDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }
</script>

<div id="profile-panel" class="flex h-full w-full md:shrink-0"
     style="max-width: 100%; --profile-w: {panelWidth}px;">
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
            style="color: var(--rc-timestamp);">profile</span>
      <button
        onclick={onClose}
        class="text-[18px] leading-none hover:opacity-60 p-1"
        style="color: var(--rc-timestamp);"
        aria-label="Close profile"
      >&times;</button>
    </div>

    <!-- Profile content -->
    <div class="flex-1 overflow-y-auto p-5">
      <div class="flex flex-col items-center text-center gap-3">
        <Avatar url={avatarUrl} {displayName} {username} size={96} />
        <div>
          <div class="text-[15px] font-bold" style="color: var(--foreground);">{displayName}</div>
          {#if username}
            <div class="text-[12px] mt-0.5" style="color: var(--rc-timestamp);">@{username}</div>
          {/if}
        </div>
        <div class="flex items-center gap-1.5">
          {#if isBot}
            <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px]"
                  style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
          {/if}
          {#if role === 'admin'}
            <span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px]"
                  style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">ADMIN</span>
          {/if}
        </div>
        {#if userCreatedAt}
          <div class="text-[11px]" style="color: var(--rc-timestamp);">
            member since {formatJoinDate(userCreatedAt)}
          </div>
        {/if}
        {#if onMessage}
          <button
            onclick={onMessage}
            class="w-full px-3 py-1.5 text-[12px] border font-mono mt-3"
            style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
          >Message</button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  @media (min-width: 768px) {
    #profile-panel {
      width: var(--profile-w);
    }
  }
</style>
