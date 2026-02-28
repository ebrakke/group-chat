export type ThemeId = 'parchment' | 'terminal';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  colors: { bg: string; fg: string; accent: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'parchment',
    name: 'Parchment',
    colors: { bg: 'oklch(0.95 0.026 85)', fg: 'oklch(0.17 0.014 60)', accent: 'oklch(0.42 0.07 110)' }
  },
  {
    id: 'terminal',
    name: 'Terminal',
    colors: { bg: 'oklch(0.13 0.005 240)', fg: 'oklch(0.85 0.15 145)', accent: 'oklch(0.70 0.15 145)' }
  }
];

class ThemeStore {
  current = $state<ThemeId>('parchment');

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as ThemeId | null;
      if (saved && THEMES.some((t) => t.id === saved)) {
        this.current = saved;
      }
      this.apply();
    }
  }

  apply() {
    if (typeof document === 'undefined') return;
    if (this.current === 'parchment') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = this.current;
    }
  }

  set(id: ThemeId) {
    this.current = id;
    localStorage.setItem('theme', id);
    this.apply();
  }
}

export const themeStore = new ThemeStore();
