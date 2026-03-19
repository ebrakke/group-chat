<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let copied = $state(false);

  // If no invite code (direct navigation or refresh), go to channels
  if (!authStore.bootstrapInviteCode) {
    goto('/channels');
  }

  const inviteUrl = $derived(
    authStore.bootstrapInviteCode
      ? `${window.location.origin}/invite/${authStore.bootstrapInviteCode}`
      : ''
  );

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  function goToChat() {
    authStore.bootstrapInviteCode = '';
    goto('/channels');
  }
</script>

<div class="flex items-center justify-center min-h-screen font-mono"
     style="background: var(--background); color: var(--foreground);">
  <div class="w-full max-w-sm p-8 text-center">
    <div class="mb-2">
      <span class="text-[18px] font-bold tracking-tight">relay</span><span class="text-[18px]" style="color: var(--rc-timestamp);">.chat</span>
    </div>
    <p class="text-[14px] mb-6" style="color: var(--foreground);">your chat is ready!</p>
    <p class="text-[12px] mb-4" style="color: var(--rc-timestamp);">share this link to invite your team</p>

    <div class="flex items-center gap-2 mb-6">
      <input
        type="text"
        readonly
        value={inviteUrl}
        class="flex-1 px-3 py-2 border text-[11px] font-mono outline-none truncate"
        style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
      />
      <button
        onclick={copyLink}
        class="px-3 py-2 text-[12px] font-mono border shrink-0 transition-colors"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
      >{copied ? 'copied!' : 'copy'}</button>
    </div>

    <button
      onclick={goToChat}
      class="text-[12px] hover:underline underline-offset-2"
      style="color: var(--rc-timestamp);"
    >go to chat &rarr;</button>
  </div>
</div>
