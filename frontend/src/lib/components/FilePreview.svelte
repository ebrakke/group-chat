<script lang="ts">
  import type { FileAttachment } from '$lib/types';
  import { getApiBase } from '$lib/utils/platform';
  import ImageLightbox from './ImageLightbox.svelte';

  let { file }: { file: FileAttachment } = $props();

  const isImage = $derived(file.mimeType.startsWith('image/'));
  const fileUrl = $derived(`${getApiBase()}/api/files/${file.id}`);
  const sizeLabel = $derived(formatSize(file.sizeBytes));

  let lightboxOpen = $state(false);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

{#if isImage}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class="block mt-1 cursor-pointer"
    onclick={(e) => { e.stopPropagation(); lightboxOpen = true; }}
  >
    <img
      src={fileUrl}
      alt={file.originalName}
      class="max-w-full sm:max-w-sm max-h-64 rounded border"
      style="border-color: var(--border);"
      loading="lazy"
    />
  </span>

  {#if lightboxOpen}
    <ImageLightbox src={fileUrl} alt={file.originalName} onClose={() => (lightboxOpen = false)} />
  {/if}
{:else}
  <a
    href={fileUrl}
    target="_blank"
    rel="noopener"
    class="inline-flex items-center gap-2 mt-1 px-2 py-1 text-[12px] border rounded hover:opacity-80"
    style="border-color: var(--border); color: var(--rc-olive);"
  >
    <span>{file.originalName}</span>
    <span class="text-[10px]" style="color: var(--rc-timestamp);">({sizeLabel})</span>
  </a>
{/if}
