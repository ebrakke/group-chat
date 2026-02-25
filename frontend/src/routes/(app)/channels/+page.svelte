<script lang="ts">
  import { goto } from '$app/navigation';
  import { channelStore } from '$lib/stores/channels';

  // Auto-redirect to the first channel when channels are loaded
  $effect(() => {
    if (channelStore.channels.length > 0) {
      goto(`/channels/${channelStore.channels[0].id}`, { replaceState: true });
    }
  });
</script>

<div class="flex items-center justify-center h-full text-gray-500">
  <p>Loading channels...</p>
</div>
