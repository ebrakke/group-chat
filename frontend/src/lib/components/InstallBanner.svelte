<script lang="ts">
  import { onMount } from 'svelte';

  let deferredPrompt: any = $state(null);
  let dismissed = $state(false);
  let isStandalone = $state(false);

  onMount(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isStandalone = true;
      return;
    }

    const dismissedAt = localStorage.getItem('install-banner-dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      dismissed = true;
      return;
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
    });
  });

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      dismissed = true;
    }
  }

  function dismiss() {
    localStorage.setItem('install-banner-dismissed', String(Date.now()));
    dismissed = true;
  }

  const show = $derived(deferredPrompt && !dismissed && !isStandalone);
</script>

{#if show}
  <div class="flex items-center justify-between px-3 py-2 text-[12px] font-mono border-b z-50"
       style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);">
    <span>install relay chat for the best experience</span>
    <div class="flex items-center gap-2 shrink-0 ml-2">
      <button
        onclick={install}
        class="px-2 py-0.5 border text-[11px] hover:opacity-80"
        style="border-color: var(--rc-channel-active-fg);"
      >install</button>
      <button
        onclick={dismiss}
        class="hover:opacity-60 p-0.5"
        aria-label="Dismiss"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}
