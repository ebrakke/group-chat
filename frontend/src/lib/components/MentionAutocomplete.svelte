<script lang="ts">
  import { api } from '$lib/api';
  import type { User } from '$lib/types';

  let {
    inputEl,
    onSelect
  }: {
    inputEl: HTMLTextAreaElement | undefined;
    onSelect: (newValue: string) => void;
  } = $props();

  let visible = $state(false);
  let users = $state<User[]>([]);
  let activeIndex = $state(0);
  let atPos = $state(-1);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  export function handleInput() {
    if (!inputEl) return;

    const cursorPos = inputEl.selectionStart;
    const text = inputEl.value;

    // Scan backward from cursor for '@' preceded by start-of-line or whitespace
    let foundAt = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') {
        // Check that '@' is at start of line or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          foundAt = i;
        }
        break;
      }
      // If we hit whitespace before finding '@', stop searching
      if (/\s/.test(ch)) break;
    }

    if (foundAt === -1) {
      close();
      return;
    }

    const query = text.slice(foundAt + 1, cursorPos);
    atPos = foundAt;

    // Debounce the API call
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const results = await api<User[]>('GET', `/api/users/search?q=${encodeURIComponent(query)}`);
        if (atPos !== foundAt) return; // Position changed, ignore stale result
        users = results;
        activeIndex = 0;
        visible = users.length > 0;
      } catch {
        close();
      }
    }, 150);
  }

  export function handleKeydown(e: KeyboardEvent): boolean {
    if (!visible) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % users.length;
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + users.length) % users.length;
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectUser(users[activeIndex]);
      return true;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return true;
    }

    return false;
  }

  function selectUser(user: User) {
    if (!inputEl) return;

    const text = inputEl.value;
    const cursorPos = inputEl.selectionStart;
    const before = text.slice(0, atPos);
    const after = text.slice(cursorPos);
    const newValue = `${before}@${user.username} ${after}`;

    onSelect(newValue);
    close();

    // Set cursor position after the inserted mention
    const newCursorPos = atPos + user.username.length + 2; // +2 for '@' and space
    requestAnimationFrame(() => {
      if (inputEl) {
        inputEl.selectionStart = newCursorPos;
        inputEl.selectionEnd = newCursorPos;
      }
    });
  }

  function close() {
    visible = false;
    users = [];
    activeIndex = 0;
    atPos = -1;
    if (debounceTimer) clearTimeout(debounceTimer);
  }
</script>

{#if visible && users.length > 0}
  <div
    class="mention-autocomplete absolute bottom-full left-0 mb-1 w-64 border z-50 overflow-hidden"
    style="background: var(--background); border-color: var(--border);"
  >
    {#each users as user, i (user.id)}
      <button
        class="w-full text-left px-3 py-2 flex flex-col transition-colors"
        style="background: {i === activeIndex ? 'var(--rc-message-hover)' : 'transparent'};"
        onmousedown={(e: MouseEvent) => { e.preventDefault(); selectUser(user); }}
        onmouseenter={() => (activeIndex = i)}
      >
        <span class="text-[12px] font-bold" style="color: var(--foreground);">@{user.username}</span>
        <span class="text-[11px]" style="color: var(--rc-timestamp);">{user.displayName}</span>
      </button>
    {/each}
  </div>
{/if}
