<script lang="ts">
  import type { Message as MessageType } from '$lib/types';
  import Message from './Message.svelte';
  import { tick } from 'svelte';

  let {
    messages,
    onOpenThread
  }: {
    messages: MessageType[];
    onOpenThread?: (id: number) => void;
  } = $props();

  let container: HTMLDivElement | undefined = $state();

  async function scrollToBottom() {
    await tick();
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  $effect(() => {
    // Track messages length to trigger scroll
    if (messages.length) {
      scrollToBottom();
    }
  });
</script>

<div id="messages" bind:this={container} class="message-list flex-1 overflow-y-auto">
  {#each messages as msg (msg.id)}
    <Message message={msg} {onOpenThread} />
  {/each}
</div>
