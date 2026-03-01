export type ThemeId = 'parchment' | 'terminal' | 'midnight' | 'dracula' | 'solarized' | 'synthwave' | 'coffee' | 'nord' | 'sakura';

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
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    colors: { bg: 'oklch(0.12 0.03 290)', fg: 'oklch(0.90 0.03 220)', accent: 'oklch(0.65 0.25 350)' }
  },
  {
    id: 'coffee',
    name: 'Coffee',
    colors: { bg: 'oklch(0.18 0.03 55)', fg: 'oklch(0.90 0.03 80)', accent: 'oklch(0.60 0.15 55)' }
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: { bg: 'oklch(0.18 0.015 240)', fg: 'oklch(0.92 0.01 230)', accent: 'oklch(0.70 0.15 160)' }
  },
  {
    id: 'sakura',
    name: 'Sakura',
    colors: { bg: 'oklch(0.95 0.025 350)', fg: 'oklch(0.22 0.05 330)', accent: 'oklch(0.60 0.15 350)' }
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
