export function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

export function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
