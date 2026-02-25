<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  $effect(() => {
    if (authStore.loading) return;
    if (authStore.isLoggedIn) {
      goto('/channels');
    } else {
      goto('/login');
    }
  });
</script>

<div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
  <p>Loading...</p>
</div>
