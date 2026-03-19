import type { FileAttachment, User } from './types';

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const opts: RequestInit = { method, headers, credentials: 'include' };

  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  let data: { error?: string } = {};
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text) as { error?: string };
  } catch {
    // non-JSON response (e.g. 502 HTML)
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function uploadFile(file: globalThis.File, messageId?: number): Promise<FileAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (messageId) form.append('messageId', String(messageId));

  const res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as FileAttachment;
}

export async function uploadAvatar(file: globalThis.File): Promise<User> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/account/avatar', { method: 'PUT', body: form, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data as User;
}

export async function deleteAvatar(): Promise<User> {
  return api<User>('DELETE', '/api/account/avatar');
}
