<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Avatar from './Avatar.svelte';

  interface Member {
    id: number;
    username: string;
    displayName: string;
    role: string;
    avatarUrl?: string;
    createdAt: string;
    isBot?: boolean;
  }

  let {
    onClose,
    onOpenProfile
  }: {
    onClose: () => void;
    onOpenProfile: (profile: {
      displayName: string;
      username: string;
      avatarUrl?: string;
      role: string;
      userCreatedAt: string;
      isBot: boolean;
    }) => void;
  } = $props();

  let members: Member[] = $state([]);

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

  const admins = $derived(members.filter((m) => m.role === 'admin'));
  const regularMembers = $derived(members.filter((m) => m.role !== 'admin'));

  onMount(async () => {
    try {
      members = await api<Member[]>('GET', '/api/members');
    } catch {
      members = [];
    }
  });

  function handleMemberClick(m: Member) {
    onOpenProfile({
      displayName: m.displayName,
      username: m.username,
      avatarUrl: m.avatarUrl,
      role: m.role,
      userCreatedAt: m.createdAt,
      isBot: m.isBot ?? false
    });
  }
</script>

<div id="members-panel" class="flex h-full w-full md:shrink-0"
     style="max-width: 100%; --members-w: {panelWidth}px;">
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
            style="color: var(--rc-timestamp);">members &mdash; {members.length}</span>
      <button
        onclick={onClose}
        class="text-[18px] leading-none hover:opacity-60 p-1"
        style="color: var(--rc-timestamp);"
        aria-label="Close members"
      >&times;</button>
    </div>

    <!-- Members list -->
    <div class="flex-1 overflow-y-auto py-2">
      {#if admins.length > 0}
        <div class="px-3 pt-2 pb-1">
          <span class="text-[9px] font-bold uppercase tracking-[0.12em]"
                style="color: var(--rc-timestamp);">Admins — {admins.length}</span>
        </div>
        {#each admins as member (member.id)}
          <button
            class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:opacity-80 transition-opacity"
            onclick={() => handleMemberClick(member)}
          >
            <Avatar url={member.avatarUrl} displayName={member.displayName} username={member.username} size={28} />
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-medium truncate" style="color: var(--foreground);">
                {member.displayName}
                {#if member.isBot}
                  <span class="text-[8px] font-bold uppercase tracking-wide px-1 py-[1px] ml-1 align-middle"
                        style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
                {/if}
              </div>
              <div class="text-[11px] truncate" style="color: var(--rc-timestamp);">@{member.username}</div>
            </div>
          </button>
        {/each}
      {/if}

      {#if regularMembers.length > 0}
        <div class="px-3 pt-3 pb-1">
          <span class="text-[9px] font-bold uppercase tracking-[0.12em]"
                style="color: var(--rc-timestamp);">Members — {regularMembers.length}</span>
        </div>
        {#each regularMembers as member (member.id)}
          <button
            class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:opacity-80 transition-opacity"
            onclick={() => handleMemberClick(member)}
          >
            <Avatar url={member.avatarUrl} displayName={member.displayName} username={member.username} size={28} />
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-medium truncate" style="color: var(--foreground);">
                {member.displayName}
                {#if member.isBot}
                  <span class="text-[8px] font-bold uppercase tracking-wide px-1 py-[1px] ml-1 align-middle"
                        style="background: var(--rc-olive); color: var(--rc-channel-active-fg);">BOT</span>
                {/if}
              </div>
              <div class="text-[11px] truncate" style="color: var(--rc-timestamp);">@{member.username}</div>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  @media (min-width: 768px) {
    #members-panel {
      width: var(--members-w);
    }
  }
</style>
