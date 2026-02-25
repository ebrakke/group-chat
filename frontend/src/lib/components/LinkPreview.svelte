<script lang="ts">
  import type { LinkPreview } from '$lib/types';

  let { preview }: { preview: LinkPreview } = $props();
</script>

<a
  href={preview.url}
  target="_blank"
  rel="noopener noreferrer"
  class="block max-w-md border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors mt-2"
>
  {#if preview.image}
    <img
      src={preview.image}
      alt={preview.title || 'Link preview'}
      class="w-full h-40 object-cover"
    />
  {/if}
  <div class="p-3">
    {#if preview.title}
      <p class="text-sm font-semibold text-gray-200 truncate">{preview.title}</p>
    {/if}
    {#if preview.description}
      <p class="text-xs text-gray-400 mt-1 line-clamp-2">{preview.description}</p>
    {/if}
    <p class="text-xs text-gray-500 mt-1 truncate">{preview.url}</p>
  </div>
</a>
