<script lang="ts">
  import { toastStore } from '$lib/stores/toast.svelte';
</script>

{#if toastStore.toasts.length > 0}
  <div class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[60] flex flex-col gap-2">
    {#each toastStore.toasts as toast (toast.id)}
      <div
        class="px-3 py-2 text-[12px] font-mono border flex items-start gap-2"
        style="background: var(--background); border-color: {toast.type === 'error' ? 'var(--rc-mention-badge)' : 'var(--rc-olive)'}; color: {toast.type === 'error' ? 'var(--rc-mention-badge)' : 'var(--rc-olive)'};"
      >
        <span class="flex-1">{toast.message}</span>
        <button
          onclick={() => toastStore.dismiss(toast.id)}
          class="shrink-0 hover:opacity-60"
          aria-label="Dismiss"
        >&times;</button>
      </div>
    {/each}
  </div>
{/if}
