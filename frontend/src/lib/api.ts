import { getApiBase, isNative } from './utils/platform';
import type { FileAttachment, User } from './types';

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

export async function uploadFile(file: globalThis.File, messageId?: number): Promise<FileAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (messageId) form.append('messageId', String(messageId));

  const headers: Record<string, string> = {};
  const opts: RequestInit = { method: 'POST', body: form, headers };

  if (isNative() && sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = 'include';
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/upload`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as FileAttachment;
}

export async function uploadAvatar(file: globalThis.File): Promise<User> {
  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  const opts: RequestInit = { method: 'PUT', body: form, headers };

  if (isNative() && sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    opts.credentials = 'include';
  }

  const base = getApiBase();
  const res = await fetch(`${base}/api/account/avatar`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as User;
}

export async function deleteAvatar(): Promise<User> {
  return api<User>('DELETE', '/api/account/avatar');
}
