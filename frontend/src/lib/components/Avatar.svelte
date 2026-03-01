<script lang="ts">
  let {
    url,
    displayName,
    username,
    size = 36
  }: {
    url?: string;
    displayName: string;
    username?: string;
    size?: number;
  } = $props();

  // Generate a consistent color from the username/displayName
  function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `oklch(0.55 0.12 ${hue})`;
  }

  const initial = $derived(displayName.charAt(0).toUpperCase());
  const bgColor = $derived(hashColor(username || displayName));
  const fontSize = $derived(Math.round(size * 0.4));
</script>

{#if url}
  <img
    src={url}
    alt={displayName}
    class="rounded-full object-cover shrink-0"
    style="width: {size}px; height: {size}px;"
  />
{:else}
  <div
    class="rounded-full shrink-0 flex items-center justify-center font-bold select-none"
    style="width: {size}px; height: {size}px; background: {bgColor}; color: oklch(0.95 0 0); font-size: {fontSize}px;"
  >
    {initial}
  </div>
{/if}
