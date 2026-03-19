<script lang="ts">
  import { goto } from '$app/navigation';
  import { channelStore } from '$lib/stores/channels';

  // Auto-redirect to last visited channel, or first channel as fallback
  $effect(() => {
    if (channelStore.channels.length > 0) {
      const lastChannel = localStorage.getItem('last-channel');
      const target = lastChannel && channelStore.getByName(lastChannel)
        ? lastChannel
        : channelStore.channels[0].name;
      goto(`/channels/${target}`, { replaceState: true });
    }
  });
</script>

<div class="flex items-center justify-center h-full text-[12px] font-mono"
     style="color: var(--rc-timestamp);">
  <p>loading channels...</p>
</div>
