import { getApiBase, isNative } from './utils/platform';

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token && isNative()) {
    localStorage.setItem('sessionToken', token);
  } else if (!token && isNative()) {
    localStorage.removeItem('sessionToken');
  }
}

export function getSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  if (isNative()) {
    sessionToken = localStorage.getItem('sessionToken');
  }
  return sessionToken;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const opts: RequestInit = { method, headers };

  if (isNative() && sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = 'include';
  }

  if (body) opts.body = JSON.stringify(body);

  const base = getApiBase();
  const res = await fetch(`${base}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}
