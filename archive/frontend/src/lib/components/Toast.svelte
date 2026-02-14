<script lang="ts">
  import { notifications } from '$lib/stores/notifications';
  import type { Notification } from '$lib/stores/notifications';
  
  function getIconForType(type: string): string {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
      default: return 'ℹ';
    }
  }
  
  function getColorClasses(type: string): string {
    switch (type) {
      case 'success': return 'bg-green-600 text-white';
      case 'error': return 'bg-red-600 text-white';
      case 'warning': return 'bg-yellow-500 text-gray-900';
      case 'info': return 'bg-blue-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  }
</script>

<!-- Toast Container -->
<div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each $notifications as notification (notification.id)}
    <div
      class="pointer-events-auto animate-in slide-in-from-right duration-300 shadow-lg rounded-md px-4 py-3 flex items-center gap-3 min-w-[300px] max-w-[400px] {getColorClasses(notification.type)}"
      role="alert"
    >
      <div class="text-xl font-bold">
        {getIconForType(notification.type)}
      </div>
      <div class="flex-1 text-sm font-medium">
        {notification.message}
      </div>
      <button
        onclick={() => notifications.dismiss(notification.id)}
        class="hover:opacity-80 transition-opacity text-lg font-bold leading-none"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  @keyframes slide-in-from-right {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .animate-in {
    animation-name: slide-in-from-right;
  }
  
  .slide-in-from-right {
    animation-duration: 0.3s;
    animation-timing-function: ease-out;
  }
</style>
