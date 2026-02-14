<script lang="ts">
  interface Props {
    onSelect: (emoji: string) => void;
    onClose: () => void;
  }
  
  let { onSelect, onClose }: Props = $props();
  
  const commonEmojis = [
    '👍', '❤️', '😂', '🎉', '😍', '🤔',
    '👏', '🔥', '✨', '🚀', '💯', '👀',
    '😊', '😢', '😮', '😎', '🙏', '💪',
    '🎊', '✅', '❌', '⭐', '💡', '🤝',
  ];
  
  function handleEmojiClick(emoji: string) {
    onSelect(emoji);
    onClose();
  }
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

<div 
  class="fixed inset-0 z-50 flex items-end md:items-center justify-center"
  onclick={handleBackdropClick}
>
  <div class="absolute inset-0 bg-black bg-opacity-30"></div>
  
  <div class="relative bg-white rounded-t-2xl md:rounded-lg shadow-xl p-4 md:p-4 w-full md:max-w-xs md:w-auto" onclick={(e) => e.stopPropagation()}>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-base md:text-sm font-semibold text-gray-900">Pick a reaction</h3>
      <button
        onclick={onClose}
        class="text-gray-400 hover:text-gray-600 p-2 -mr-2 min-h-[44px] md:min-h-0 flex items-center justify-center"
        title="Close"
        aria-label="Close"
      >
        <svg class="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    
    <div class="grid grid-cols-6 gap-1 md:gap-2 pb-safe">
      {#each commonEmojis as emoji}
        <button
          onclick={() => handleEmojiClick(emoji)}
          class="text-3xl md:text-2xl hover:bg-gray-100 active:bg-gray-200 rounded p-3 md:p-2 transition-colors min-h-[44px]"
          title={emoji}
        >
          {emoji}
        </button>
      {/each}
    </div>
  </div>
</div>
