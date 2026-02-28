<script lang="ts">
  import MentionAutocomplete from './MentionAutocomplete.svelte';

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
        onpaste={handlePaste}
        {placeholder}
        rows="1"
        style="font-size: 13px; color: var(--foreground);"
        class="w-full bg-transparent outline-none resize-none font-mono placeholder:opacity-40"
      ></textarea>
    </div>
    <input type="file" class="hidden" bind:this={fileInput} onchange={handleFileSelect} multiple />
    <button onclick={() => fileInput?.click()} class="text-[12px] px-3 py-1.5 border shrink-0 cursor-pointer"
      style="border-color: var(--border); color: var(--rc-timestamp);">attach</button>
    <button
      id={sendButtonId}
      onclick={send}
      disabled={!text.trim() && pendingFiles.length === 0}
      class="text-[11px] px-3 py-1.5 border font-mono disabled:opacity-30 shrink-0"
      style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
    >send</button>
  </div>
</div>
