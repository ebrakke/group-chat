<script lang="ts">
  export let isOpen = $state(false);
  export let imageUrl = $state('');
  export let filename = $state('');
  export let onClose: (() => void) | undefined = undefined;
  
  function close() {
    isOpen = false;
    if (onClose) onClose();
  }
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
    onclick={handleBackdropClick}
  >
    <button
      onclick={close}
      class="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
      title="Close (Esc)"
    >
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    
    <div class="max-w-7xl max-h-[90vh] p-4">
      <img
        src={imageUrl}
        alt={filename}
        class="max-w-full max-h-[85vh] object-contain"
      />
      <p class="text-white text-center mt-4">{filename}</p>
    </div>
  </div>
{/if}
