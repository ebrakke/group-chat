export type ThemeId = 'parchment' | 'terminal' | 'midnight' | 'dracula' | 'solarized';

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
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: { bg: 'oklch(0.15 0.01 260)', fg: 'oklch(0.90 0.01 260)', accent: 'oklch(0.45 0.12 250)' }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: { bg: 'oklch(0.16 0.02 280)', fg: 'oklch(0.92 0.01 300)', accent: 'oklch(0.55 0.18 300)' }
  },
  {
    id: 'solarized',
    name: 'Solarized',
    colors: { bg: 'oklch(0.94 0.03 90)', fg: 'oklch(0.27 0.05 230)', accent: 'oklch(0.52 0.12 150)' }
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
