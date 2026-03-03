import { api } from '$lib/api';
import type { CalendarEvent } from '$lib/types';

class CalendarStore {
  events = $state<CalendarEvent[]>([]);
  loading = $state(false);

  async load(from?: string, to?: string) {
    this.loading = true;
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      this.events = await api<CalendarEvent[]>(
        'GET',
        `/api/calendar${qs ? '?' + qs : ''}`
      );
    } finally {
      this.loading = false;
    }
  }

  async create(data: {
    title: string;
    startTime: string;
    endTime: string;
    comments?: string;
  }): Promise<CalendarEvent> {
    const event = await api<CalendarEvent>('POST', '/api/calendar', data);
    // Upsert by id so we don't duplicate if WebSocket already added the same event
    this.events = this.events
      .filter((e) => e.id !== event.id)
      .concat(event)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    return event;
  }

  async update(
    id: number,
    data: {
      title: string;
      startTime: string;
      endTime: string;
      comments?: string;
    }
  ): Promise<CalendarEvent> {
    const event = await api<CalendarEvent>('PUT', `/api/calendar/${id}`, data);
    this.events = this.events
      .map((e) => (e.id === id ? event : e))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    return event;
  }

  async remove(id: number) {
    await api('DELETE', `/api/calendar/${id}`);
    this.events = this.events.filter((e) => e.id !== id);
  }

  addEvent(event: CalendarEvent) {
    if (!this.events.find((e) => e.id === event.id)) {
      this.events = [...this.events, event].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
    }
  }

  updateEvent(event: CalendarEvent) {
    this.events = this.events
      .map((e) => (e.id === event.id ? event : e))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  removeEvent(id: number) {
    this.events = this.events.filter((e) => e.id !== id);
  }
}

export const calendarStore = new CalendarStore();
