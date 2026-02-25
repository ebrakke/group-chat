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

<div id="composer" class="border-t border-gray-800 p-3">
  <div class="flex items-end gap-2">
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
        style="font-size: 16px;"
        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-500 resize-none outline-none focus:border-gray-600 transition-colors"
      ></textarea>
    </div>
    <button
      id={sendButtonId}
      onclick={send}
      disabled={!text.trim()}
      class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0"
    >
      Send
    </button>
  </div>
</div>
