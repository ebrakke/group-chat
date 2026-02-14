<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  onMount(() => {
    goto('/general', { replaceState: true });
  });
</script>

<div class="flex items-center justify-center h-dvh">
  <p class="text-gray-600">Redirecting...</p>
</div>
