<script lang="ts">
  import { onMount } from 'svelte';
  import { calendarStore } from '$lib/stores/calendar.svelte';
  import { authStore } from '$lib/stores/auth';
  import type { CalendarEvent } from '$lib/types';

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MAX_CHIPS = 3;

  let currentMonth = $state(new Date());
  let selectedDate = $state<Date | null>(null);
  let showCreateModal = $state(false);
  let editingEvent = $state<CalendarEvent | null>(null);
  let detailEvent = $state<CalendarEvent | null>(null);
  let saving = $state(false);
  let formError = $state('');

  // Form state (for create/edit)
  let formTitle = $state('');
  let formStartDate = $state('');
  let formStartTime = $state('00:00');
  let formEndDate = $state('');
  let formEndTime = $state('23:59');
  let formAllDay = $state(true);
  let formComments = $state('');

  function monthYearLabel(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function monthRange(d: Date): { from: string; to: string } {
    const y = d.getFullYear();
    const m = d.getMonth();
    const from = new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
    const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString();
    return { from, to };
  }

  function prevMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
  }

  function nextMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
  }

  function loadMonth() {
    const { from, to } = monthRange(currentMonth);
    calendarStore.load(from, to);
  }

  $effect(() => {
    loadMonth();
  });

  onMount(() => {
    loadMonth();
  });

  // Grid: 6 rows × 7 cols
  function getGridDays(): (number | null)[][] {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startDow = first.getDay();
    const numDays = last.getDate();
    const totalCells = 42;
    const days: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= numDays; d++) days.push(d);
    while (days.length < totalCells) days.push(null);
    const rows: (number | null)[][] = [];
    for (let r = 0; r < 6; r++) rows.push(days.slice(r * 7, (r + 1) * 7));
    return rows;
  }

  /** True if event overlaps the given calendar day (any time during that day). */
  function eventOverlapsDay(ev: CalendarEvent, y: number, m: number, day: number): boolean {
    const dayStart = new Date(y, m, day, 0, 0, 0);
    const dayEnd = new Date(y, m, day, 23, 59, 59, 999);
    const start = new Date(ev.startTime);
    const end = new Date(ev.endTime);
    return start <= dayEnd && end >= dayStart;
  }

  function eventsForDay(day: number): CalendarEvent[] {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return calendarStore.events.filter((e) => eventOverlapsDay(e, y, m, day));
  }

  function isSelectedDay(day: number | null): boolean {
    if (!selectedDate || day === null) return false;
    return (
      selectedDate.getFullYear() === currentMonth.getFullYear() &&
      selectedDate.getMonth() === currentMonth.getMonth() &&
      selectedDate.getDate() === day
    );
  }

  function selectDay(day: number | null) {
    if (day === null) return;
    selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  }

  function listEvents(): CalendarEvent[] {
    if (selectedDate) {
      const y = selectedDate.getFullYear();
      const m = selectedDate.getMonth();
      const d = selectedDate.getDate();
      return calendarStore.events.filter((ev) => eventOverlapsDay(ev, y, m, d));
    }
    return calendarStore.events;
  }

  function openCreateModal() {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    formStartDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    formEndDate = formStartDate;
    formTitle = '';
    formStartTime = '00:00';
    formEndTime = '23:59';
    formAllDay = true;
    formComments = '';
    formError = '';
    showCreateModal = true;
    editingEvent = null;
  }

  function openCreateModalWithDate(day: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const dateStr = `${y}-${pad(m + 1)}-${pad(day)}`;
    formStartDate = dateStr;
    formEndDate = dateStr;
    formTitle = '';
    formStartTime = '00:00';
    formEndTime = '23:59';
    formAllDay = true;
    formComments = '';
    formError = '';
    showCreateModal = true;
    editingEvent = null;
  }

  function openEditModal(ev: CalendarEvent) {
    detailEvent = null;
    editingEvent = ev;
    formTitle = ev.title;
    const pad = (n: number) => String(n).padStart(2, '0');
    const s = new Date(ev.startTime);
    const e = new Date(ev.endTime);
    formStartDate = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
    formStartTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    formEndDate = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`;
    formEndTime = `${pad(e.getHours())}:${pad(e.getMinutes())}`;
    formAllDay =
      s.getHours() === 0 &&
      s.getMinutes() === 0 &&
      e.getHours() === 23 &&
      e.getMinutes() === 59;
    formComments = ev.comments || '';
    formError = '';
    showCreateModal = true;
  }

  function closeModal() {
    showCreateModal = false;
    editingEvent = null;
    formError = '';
  }

  function toISO(dateStr: string, timeStr: string): string {
    const [hh, mm] = timeStr.split(':').map(Number);
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d, hh, mm, 0).toISOString();
  }

  async function saveEvent() {
    formError = '';
    if (!formTitle.trim()) {
      formError = 'Title is required';
      return;
    }
    const startTimeStr = formAllDay ? '00:00' : formStartTime;
    const endTimeStr = formAllDay ? '23:59' : formEndTime;
    const startTime = toISO(formStartDate, startTimeStr);
    const endTime = toISO(formEndDate, endTimeStr);
    if (new Date(endTime) <= new Date(startTime)) {
      formError = 'End must be after start';
      return;
    }
    const comments = formComments ?? '';
    saving = true;
    try {
      if (editingEvent) {
        await calendarStore.update(editingEvent.id, {
          title: formTitle.trim(),
          startTime,
          endTime,
          comments
        });
      } else {
        await calendarStore.create({
          title: formTitle.trim(),
          startTime,
          endTime,
          comments
        });
      }
      closeModal();
    } catch (err: unknown) {
      formError = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function deleteEvent(ev: CalendarEvent) {
    if (!confirm('Delete this event?')) return;
    try {
      await calendarStore.remove(ev.id);
      detailEvent = null;
    } catch {
      // 403 etc. handled by store / toast could be added
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const canDelete = (ev: CalendarEvent) =>
    authStore.user && (ev.createdBy === authStore.user.id || authStore.user.role === 'admin');
</script>

<div class="flex flex-col h-full overflow-hidden" style="background: var(--background);">
  <!-- Header -->
  <div
    class="flex items-center justify-between px-4 py-3 border-b shrink-0"
    style="border-color: var(--border);"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={prevMonth}
        class="p-1.5 hover:opacity-70"
        style="color: var(--rc-timestamp);"
        aria-label="Previous month"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="text-[14px] font-bold min-w-[160px] text-center" style="color: var(--foreground);">
        {monthYearLabel(currentMonth)}
      </span>
      <button
        type="button"
        onclick={nextMonth}
        class="p-1.5 hover:opacity-70"
        style="color: var(--rc-timestamp);"
        aria-label="Next month"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    <button
      type="button"
      onclick={openCreateModal}
      class="text-[14px] leading-none p-2 border font-mono"
      style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
    >
      +
    </button>
  </div>

  <div class="flex-1 flex flex-col md:flex-row min-h-0">
    <!-- Month grid -->
    <div class="flex-1 overflow-auto p-4 border-b md:border-b-0 md:border-r shrink-0"
         style="border-color: var(--border);">
      <div class="text-[10px] uppercase tracking-wider grid grid-cols-7 gap-px mb-1"
           style="color: var(--rc-timestamp);">
        {#each DAYS as day}
          <div class="text-center py-1">{day}</div>
        {/each}
      </div>
      {#if calendarStore.loading}
        <p class="text-[12px] font-mono py-4" style="color: var(--rc-timestamp);">loading...</p>
      {:else}
        <div class="grid grid-cols-7 gap-px font-mono text-[12px]">
          {#each getGridDays() as row, rowIdx}
            {#each row as day, colIdx (day === null ? `empty-${rowIdx}-${colIdx}` : `${currentMonth.getTime()}-${day}`)}
              {@const evs = day !== null ? eventsForDay(day) : []}
              <button
                type="button"
                class="min-h-[64px] md:min-h-[80px] p-1 border text-left flex flex-col"
                style="border-color: var(--border); background: {isSelectedDay(day)
                  ? 'var(--rc-channel-active-bg)'
                  : 'transparent'}; color: {day === null
                  ? 'var(--rc-timestamp)'
                  : 'var(--foreground)'};"
                onclick={() => {
                  selectDay(day);
                  if (day !== null) openCreateModalWithDate(day);
                }}
                disabled={day === null}
              >
                {#if day !== null}
                  <span class="text-[11px] mb-0.5" style="color: var(--rc-timestamp);">{day}</span>
                  {#each evs.slice(0, MAX_CHIPS) as ev}
                    <button
                      type="button"
                      class="text-[10px] truncate px-1 py-0.5 rounded mb-0.5 cursor-pointer hover:opacity-90 w-full text-left"
                      style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg);"
                      onclick={(e) => {
                        e.stopPropagation();
                        detailEvent = ev;
                      }}
                    >
                      {ev.title}
                    </button>
                  {/each}
                  {#if evs.length > MAX_CHIPS}
                    <span class="text-[10px]" style="color: var(--rc-timestamp);">+{evs.length - MAX_CHIPS} more</span>
                  {/if}
                {/if}
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Event list -->
    <div class="w-full md:w-72 flex flex-col border-t md:border-t-0 shrink-0"
         style="border-color: var(--border);">
      <div class="px-3 py-2 border-b text-[11px] uppercase tracking-wider"
           style="border-color: var(--border); color: var(--rc-timestamp);">
        {selectedDate ? 'Selected day' : 'This month'}
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        {#each listEvents() as ev (ev.id)}
          <button
            type="button"
            class="w-full text-left px-3 py-2 rounded mb-1 border font-mono text-[12px]"
            style="border-color: var(--border); background: var(--rc-muted); color: var(--foreground);"
            onclick={() => (detailEvent = ev)}
          >
            <span class="font-semibold block truncate">{ev.title}</span>
            <span class="text-[11px]" style="color: var(--rc-timestamp);">
              {formatDate(ev.startTime)} · {formatTime(ev.startTime)}
            </span>
          </button>
        {:else}
          <p class="text-[12px] font-mono py-4" style="color: var(--rc-timestamp);">no events</p>
        {/each}
      </div>
    </div>
  </div>

  <!-- Event detail (overlay panel) -->
  {#if detailEvent}
    <div
      class="fixed inset-4 md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:max-w-md md:w-full md:max-h-[80vh] rounded border z-50 p-4 flex flex-col gap-3 overflow-auto"
      style="background: var(--background); border-color: var(--border); box-shadow: 0 4px 20px rgba(0,0,0,0.15);"
    >
      <div class="flex justify-between items-start">
        <h3 class="text-[14px] font-bold font-mono" style="color: var(--foreground);">{detailEvent.title}</h3>
        <button
          type="button"
          onclick={() => (detailEvent = null)}
          class="p-1 hover:opacity-70"
          style="color: var(--rc-timestamp);"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p class="text-[12px] font-mono" style="color: var(--rc-timestamp);">
        {formatDate(detailEvent.startTime)} {formatTime(detailEvent.startTime)} – {formatDate(detailEvent.endTime)} {formatTime(detailEvent.endTime)}
      </p>
      {#if detailEvent.comments}
        <p class="text-[12px] font-mono whitespace-pre-wrap" style="color: var(--foreground);">{detailEvent.comments}</p>
      {/if}
      <p class="text-[11px]" style="color: var(--rc-timestamp);">
        by {detailEvent.createdByName ?? '?'}
      </p>
      <div class="flex gap-2 mt-auto pt-2">
        <button
          type="button"
          onclick={() => {
            openEditModal(detailEvent!);
            detailEvent = null;
          }}
          class="px-3 py-1.5 text-[12px] border font-mono"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >
          Edit
        </button>
        {#if canDelete(detailEvent)}
          <button
            type="button"
            onclick={() => deleteEvent(detailEvent!)}
            class="px-3 py-1.5 text-[12px] border font-mono"
            style="color: var(--rc-mention-badge); border-color: var(--border);"
          >
            Delete
          </button>
        {/if}
      </div>
    </div>
    <!-- Backdrop on mobile -->
    <button
      type="button"
      class="fixed inset-0 bg-black/30 z-40 md:hidden"
      aria-label="Close"
      onclick={() => (detailEvent = null)}
    ></button>
  {/if}
</div>

<!-- Create/Edit modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
    role="dialog"
    aria-modal="true"
    aria-label={editingEvent ? 'Edit event' : 'Create event'}
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && closeModal()}
  >
    <div
      class="w-full max-w-md border p-4 flex flex-col gap-3 font-mono"
      style="background: var(--background); border-color: var(--border);"
    >
      <h2 class="text-[14px] font-bold" style="color: var(--foreground);">
        {editingEvent ? 'Edit event' : 'New event'}
      </h2>
      {#if formError}
        <p class="text-[12px]" style="color: var(--rc-mention-badge);">{formError}</p>
      {/if}
      <label class="block">
        <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">Title</span>
        <input
          type="text"
          bind:value={formTitle}
          class="w-full px-2 py-1.5 text-[13px] border outline-none"
          style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          placeholder="Event name"
        />
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={formAllDay} class="rounded" />
        <span class="text-[12px]" style="color: var(--foreground);">All day</span>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">Start date</span>
          <input
            type="date"
            bind:value={formStartDate}
            class="w-full px-2 py-1.5 text-[13px] border outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          />
        </label>
        {#if !formAllDay}
          <label class="block">
            <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">Start time</span>
            <input
              type="time"
              bind:value={formStartTime}
              class="w-full px-2 py-1.5 text-[13px] border outline-none"
              style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            />
          </label>
        {/if}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">End date</span>
          <input
            type="date"
            bind:value={formEndDate}
            class="w-full px-2 py-1.5 text-[13px] border outline-none"
            style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
          />
        </label>
        {#if !formAllDay}
          <label class="block">
            <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">End time</span>
            <input
              type="time"
              bind:value={formEndTime}
              class="w-full px-2 py-1.5 text-[13px] border outline-none"
              style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
            />
          </label>
        {/if}
      </div>
      <label class="block">
        <span class="text-[11px] block mb-1" style="color: var(--rc-timestamp);">Comments (optional)</span>
        <textarea
          bind:value={formComments}
          rows="2"
          class="w-full px-2 py-1.5 text-[13px] border outline-none resize-none"
          style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
        ></textarea>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={closeModal}
          class="px-3 py-1.5 text-[12px] hover:underline"
          style="color: var(--rc-timestamp);"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={saveEvent}
          disabled={saving}
          class="px-3 py-1.5 text-[12px] border font-mono disabled:opacity-50"
          style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}
