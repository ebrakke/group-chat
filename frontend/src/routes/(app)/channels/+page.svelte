<script lang="ts">
  import { goto } from '$app/navigation';
  import { channelStore } from '$lib/stores/channels';

  // Auto-redirect to the first channel when channels are loaded
  $effect(() => {
    if (channelStore.channels.length > 0) {
      goto(`/channels/${channelStore.channels[0].name}`, { replaceState: true });
    }
  });
</script>

<div class="flex items-center justify-center h-full text-[12px] font-mono"
     style="color: var(--rc-timestamp);">
  <p>loading channels...</p>
</div>
