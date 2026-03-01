<script lang="ts">
  let { src, alt, onClose }: { src: string; alt: string; onClose: () => void } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
  onclick={handleBackdropClick}
>
  <button
    class="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none p-2 z-10"
    onclick={onClose}
    aria-label="Close"
  >&times;</button>

  <img
    {src}
    {alt}
    class="max-w-[95vw] max-h-[90vh] object-contain"
  />
</div>
