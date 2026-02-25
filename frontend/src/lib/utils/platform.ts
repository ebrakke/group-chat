import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

export function getApiBase(): string {
  if (isNative()) {
    return localStorage.getItem('serverUrl') || '';
  }
  return '';
}

export function getWsUrl(): string {
  if (isNative()) {
    const base = localStorage.getItem('serverUrl');
    if (base) {
      try {
        const url = new URL(base);
        const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${url.host}/ws`;
      } catch { /* fall through */ }
    }
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
