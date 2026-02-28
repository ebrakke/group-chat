import { api } from '$lib/api';
import { toastStore } from '$lib/stores/toast.svelte';
import type { SearchResult } from '$lib/types';

class SearchStore {
  results = $state<SearchResult[]>([]);
  query = $state('');
  loading = $state(false);
  open = $state(false);

  async search(query: string) {
    if (!query.trim()) {
      this.results = [];
      this.query = '';
      return;
    }
    this.loading = true;
    this.query = query;
    try {
      this.results = await api<SearchResult[]>(
        'GET',
        `/api/search?q=${encodeURIComponent(query)}&limit=50`
      );
    } catch {
      this.results = [];
      toastStore.error('Search failed');
    } finally {
      this.loading = false;
    }
  }

  toggle() {
    this.open = !this.open;
    if (!this.open) {
      this.results = [];
      this.query = '';
    }
  }

  close() {
    this.open = false;
    this.results = [];
    this.query = '';
  }
}

export const searchStore = new SearchStore();
