<script lang="ts">
  import MentionAutocomplete from './MentionAutocomplete.svelte';

  let {
    onSend,
    placeholder = 'Type a message...',
    inputId = 'msg-input',
    sendButtonId = 'msg-send'
  }: {
    onSend: (content: string) => void;
    placeholder?: string;
    inputId?: string;
    sendButtonId?: string;
  } = $props();

  let text = $state('');
  let textarea: HTMLTextAreaElement | undefined = $state();
  let autocomplete: MentionAutocomplete | undefined = $state();

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  function handleKeydown(e: KeyboardEvent) {
    // Let autocomplete handle the keydown first
    if (autocomplete?.handleKeydown(e)) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const content = text.trim();
    if (!content) return;
    onSend(content);
    text = '';
    if (textarea) {
      textarea.style.height = 'auto';
    }
  }

  function handleInput() {
    autoResize();
    autocomplete?.handleInput();
  }

  function handleAutocompleteSelect(newValue: string) {
    text = newValue;
  }
</script>

<div id="composer" class="shrink-0 border-t px-4 py-3 flex items-center gap-2"
     style="border-color: var(--border);">
  <span class="text-[13px] select-none" style="color: var(--rc-timestamp);">{'>'}</span>
  <div class="relative flex-1">
    <MentionAutocomplete
      bind:this={autocomplete}
      inputEl={textarea}
      onSelect={handleAutocompleteSelect}
    />
    <textarea
      id={inputId}
      bind:this={textarea}
      bind:value={text}
      oninput={handleInput}
      onkeydown={handleKeydown}
      {placeholder}
      rows="1"
      style="font-size: 13px; color: var(--foreground);"
      class="w-full bg-transparent outline-none resize-none font-mono placeholder:opacity-40"
    ></textarea>
  </div>
  <button
    id={sendButtonId}
    onclick={send}
    disabled={!text.trim()}
    class="text-[11px] px-3 py-1.5 border font-mono disabled:opacity-30 shrink-0"
    style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
  >send</button>
</div>
