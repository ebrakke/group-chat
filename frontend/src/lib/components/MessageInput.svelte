<script lang="ts">
  import MentionAutocomplete from './MentionAutocomplete.svelte';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Plus from 'lucide-svelte/icons/plus';

  let {
    onSend,
    placeholder = 'Type a message...',
    inputId = 'msg-input',
    sendButtonId = 'msg-send'
  }: {
    onSend: (content: string, files?: globalThis.File[]) => void;
    placeholder?: string;
    inputId?: string;
    sendButtonId?: string;
  } = $props();

  let text = $state('');
  let textarea: HTMLTextAreaElement | undefined = $state();
  let autocomplete: MentionAutocomplete | undefined = $state();
  let pendingFiles = $state<globalThis.File[]>([]);
  let fileInput: HTMLInputElement | undefined = $state();

  const hasContent = $derived(text.trim().length > 0 || pendingFiles.length > 0);

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
    if (!content && pendingFiles.length === 0) return;
    onSend(content || '', pendingFiles.length > 0 ? [...pendingFiles] : undefined);
    text = '';
    pendingFiles = [];
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

  function handleFileSelect() {
    if (fileInput?.files) {
      pendingFiles = [...pendingFiles, ...Array.from(fileInput.files)];
      fileInput.value = '';
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files) {
      pendingFiles = [...pendingFiles, ...Array.from(e.dataTransfer.files)];
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handlePaste(e: ClipboardEvent) {
    if (e.clipboardData?.files.length) {
      pendingFiles = [...pendingFiles, ...Array.from(e.clipboardData.files)];
    }
  }

  function removePending(index: number) {
    pendingFiles = pendingFiles.filter((_, i) => i !== index);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div ondrop={handleDrop} ondragover={handleDragOver}>
  {#if pendingFiles.length > 0}
    <div class="flex flex-wrap gap-2 px-4 py-2 border-t" style="border-color: var(--border);">
      {#each pendingFiles as file, i}
        <div class="flex items-center gap-1 px-2 py-1 text-[11px] border rounded"
          style="border-color: var(--border); color: var(--foreground);">
          <span class="max-w-[120px] truncate">{file.name}</span>
          <button onclick={() => removePending(i)} class="text-[10px] hover:opacity-60 cursor-pointer"
            style="color: var(--rc-timestamp);">x</button>
        </div>
      {/each}
    </div>
  {/if}

  <input type="file" class="hidden" bind:this={fileInput} onchange={handleFileSelect} multiple />

  <div id="composer" class="shrink-0 border-t" style="border-color: var(--border);">
    <div class="flex items-end md:items-start gap-2 px-3 md:px-4 pt-2 md:py-3 pb-1 md:pb-3">
      <span class="hidden md:inline text-[13px] leading-[20px] select-none" style="color: var(--rc-timestamp);">{'>'}</span>
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
          onpaste={handlePaste}
          {placeholder}
          rows="1"
          class="w-full bg-transparent outline-none resize-none font-mono placeholder:opacity-40 text-[14px] md:text-[13px]"
          style="color: var(--foreground);"
        ></textarea>
      </div>
      <button onclick={() => fileInput?.click()} class="hidden md:block text-[12px] px-3 py-1.5 border shrink-0 cursor-pointer"
        style="border-color: var(--border); color: var(--rc-timestamp);">attach</button>
      <button
        id={sendButtonId}
        onclick={send}
        disabled={!hasContent}
        class="hidden md:block text-[11px] px-3 py-1.5 border font-mono disabled:opacity-30 shrink-0"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
      >send</button>
      <button
        onclick={send}
        disabled={!hasContent}
        class="md:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30 mb-0.5"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg);"
        title="Send"
      >
        <ArrowRight size={16} strokeWidth={2.5} />
      </button>
    </div>
    <div class="md:hidden flex items-center gap-1 px-3 pb-2">
      <button onclick={() => fileInput?.click()} class="p-1.5 cursor-pointer hover:opacity-60"
        style="color: var(--rc-timestamp);"
        title="Attach file"
      >
        <Plus size={20} />
      </button>
    </div>
  </div>
</div>
