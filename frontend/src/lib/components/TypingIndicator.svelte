<script lang="ts">
  import { typingStore } from '$lib/stores/typing.svelte';

  let { channelId, parentId = null }: { channelId: number; parentId?: number | null } = $props();

  let text = $derived(typingStore.getTypingText(channelId, parentId));
</script>

<div class="px-4 h-5 text-[11px] font-mono flex items-center" style="color: var(--rc-timestamp);">
  {text}
</div>
