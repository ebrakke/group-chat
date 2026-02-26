<script lang="ts">
  import type { LinkPreview } from '$lib/types';

  let { preview }: { preview: LinkPreview } = $props();
</script>

<a
  href={preview.url}
  target="_blank"
  rel="noopener noreferrer"
  class="block max-w-sm border overflow-hidden hover:opacity-80 transition-opacity mt-2"
  style="border-color: var(--border); border-left: 2px solid var(--rc-link);"
>
  {#if preview.image}
    <img
      src={preview.image}
      alt={preview.title || 'Link preview'}
      class="w-full h-40 object-cover"
    />
  {/if}
  <div class="px-3 py-2.5">
    {#if preview.title}
      <p class="text-[12px] font-medium leading-snug mb-0.5" style="color: var(--foreground);">{preview.title}</p>
    {/if}
    {#if preview.description}
      <p class="text-[11px] leading-snug line-clamp-2" style="color: var(--rc-muted-fg);">{preview.description}</p>
    {/if}
    <p class="text-[10px] mt-1 truncate" style="color: var(--rc-timestamp);">{preview.url}</p>
  </div>
</a>
