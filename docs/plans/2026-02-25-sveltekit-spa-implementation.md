# SvelteKit SPA/PWA Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the vanilla JS frontend as a SvelteKit 5 SPA with Tailwind v4, preserving all functionality.

**Architecture:** Static SPA built with `adapter-static` and served by the existing Go binary via `//go:embed`. Svelte 5 runes for reactivity, Tailwind v4 for styling. No backend changes.

**Tech Stack:** SvelteKit 5, Svelte 5 (runes), Tailwind CSS v4, TypeScript, Bun, Vite, marked.js, Capacitor

---

### Task 1: Scaffold SvelteKit Project

**Files:**
- Delete: `frontend/src/app.js`, `frontend/src/style.css`, `frontend/src/index.html`, `frontend/src/sw.js`, `frontend/src/markdown.js`, `frontend/build.js`
- Keep: `frontend/src/icon-192.png`, `frontend/src/icon-512.png`, `frontend/src/manifest.json`, `frontend/dist/`
- Create: SvelteKit project files in `frontend/`

**Step 1: Back up icons and manifest, remove old frontend source files**

```bash
cd frontend
cp src/icon-192.png src/icon-512.png src/manifest.json /tmp/
rm -f build.js
rm -f src/app.js src/style.css src/index.html src/sw.js src/markdown.js
```

**Step 2: Initialize SvelteKit project in frontend/**

```bash
cd frontend
bunx sv create . --template minimal --types ts --no-add-ons --no-install
```

If the interactive CLI doesn't support those flags, create the files manually. The key files needed:

`frontend/svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: 'index.html',
      precompress: false,
      strict: true
    })
  }
};

export default config;
```

`frontend/vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'http://localhost:8080', ws: true },
      '/relay': { target: 'http://localhost:8080', ws: true }
    }
  }
});
```

`frontend/tsconfig.json`:
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

`frontend/src/app.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" href="/icon-192.png" />
    <title>Relay Chat</title>
    %sveltekit.head%
  </head>
  <body>
    <div id="app">%sveltekit.body%</div>
  </body>
</html>
```

`frontend/src/app.css`:
```css
@import 'tailwindcss';
```

**Step 3: Install dependencies**

```bash
cd frontend
bun add -d @sveltejs/adapter-static @sveltejs/kit @sveltejs/vite-plugin-svelte svelte vite typescript @tailwindcss/vite tailwindcss
bun add marked @capacitor/core @capacitor/app @capacitor/push-notifications
```

**Step 4: Create root layout files**

`frontend/src/routes/+layout.ts`:
```ts
export const ssr = false;
export const prerender = false;
```

`frontend/src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

`frontend/src/routes/+page.svelte`:
```svelte
<div class="flex items-center justify-center h-screen bg-gray-950 text-gray-200">
  <h1 class="text-2xl">Relay Chat</h1>
</div>
```

**Step 5: Restore static assets**

```bash
mkdir -p frontend/static
cp /tmp/icon-192.png /tmp/icon-512.png /tmp/manifest.json frontend/static/
```

**Step 6: Update package.json scripts**

The `package.json` should have these scripts:
```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

**Step 7: Verify build works**

```bash
cd frontend && bun run build
ls dist/
# Should see: index.html, _app/ directory with hashed assets, icon-192.png, icon-512.png, manifest.json
```

**Step 8: Update Makefile frontend target**

The Makefile `frontend` target needs updating since Vite outputs to a `_app/` subdirectory with different structure:

```makefile
frontend:
	cd frontend && bun install && bun run build
	rm -rf cmd/app/static/*
	cp -r frontend/dist/* cmd/app/static/
```

**Step 9: Update Dockerfile.fly frontend build stage**

```dockerfile
# --- frontend build (bun) ---
FROM oven/bun:1.3.9-alpine AS web
WORKDIR /src
COPY frontend/ ./frontend/
WORKDIR /src/frontend
RUN bun install --frozen-lockfile
RUN bun run build
```

No change needed — `bun run build` now calls `vite build` instead of `bun run build.js`, output is still `frontend/dist/`.

**Step 10: Verify full build pipeline**

```bash
make build
```

**Step 11: Commit**

```bash
git add -A frontend/ Makefile
git commit -m "feat: scaffold SvelteKit 5 project with Tailwind v4 and adapter-static"
```

---

### Task 2: API Client, Platform Utils, and Type Definitions

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/utils/platform.ts`
- Create: `frontend/src/lib/types.ts`

**Step 1: Create type definitions**

`frontend/src/lib/types.ts`:
```ts
export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  isBot?: boolean;
}

export interface Channel {
  id: number;
  name: string;
  unreadCount?: number;
  hasMention?: boolean;
}

export interface Message {
  id: number;
  channelId: number;
  userId?: number;
  parentId?: number | null;
  content: string;
  createdAt: string;
  username?: string;
  displayName: string;
  replyCount?: number;
  isBot?: boolean;
  mentions?: string[];
  reactions?: Reaction[];
  linkPreviews?: LinkPreview[];
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: number[];
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface ThreadSummary {
  parentId: number;
  channelId: number;
  channelName: string;
  authorDisplayName: string;
  contentPreview: string;
  replyCount: number;
  lastActivityAt: string;
  authorIsBot?: boolean;
}

export interface NotificationSettings {
  userId: number;
  provider?: string;
  providerConfig?: string;
  notifyMentions: boolean;
  notifyThreadReplies: boolean;
  notifyAllMessages: boolean;
  configured: boolean;
}

export interface Bot {
  id: number;
  username: string;
  displayName: string;
}

export interface BotToken {
  id: number;
  label?: string;
  token?: string;
  revokedAt?: string | null;
}

export interface ChannelBinding {
  channelId: number;
  channelName?: string;
  canRead: boolean;
  canWrite: boolean;
}

export interface Invite {
  code: string;
  useCount: number;
  maxUses?: number | null;
}
```

**Step 2: Create platform utilities**

`frontend/src/lib/utils/platform.ts`:
```ts
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
```

**Step 3: Create API client**

`frontend/src/lib/api.ts`:
```ts
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
```

**Step 4: Verify types compile**

```bash
cd frontend && bunx svelte-check
```

**Step 5: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat: add API client, platform utils, and TypeScript types"
```

---

### Task 3: Auth Store and Auth Screens

**Files:**
- Create: `frontend/src/lib/stores/auth.ts`
- Create: `frontend/src/routes/login/+page.svelte`
- Create: `frontend/src/routes/bootstrap/+page.svelte`
- Create: `frontend/src/routes/signup/+page.svelte`
- Modify: `frontend/src/routes/+layout.svelte`
- Modify: `frontend/src/routes/+page.svelte`

**Step 1: Create auth store**

`frontend/src/lib/stores/auth.ts`:
```ts
import { api, setSessionToken, getSessionToken } from '$lib/api';
import type { User } from '$lib/types';

class AuthStore {
  user = $state<User | null>(null);
  loading = $state(true);
  hasUsers = $state(true);

  get isLoggedIn() { return this.user !== null; }
  get isAdmin() { return this.user?.role === 'admin'; }

  async checkAuth() {
    this.loading = true;
    try {
      // Restore token for native
      const token = getSessionToken();
      if (token) setSessionToken(token);

      this.user = await api<User>('GET', '/api/auth/me');
    } catch {
      this.user = null;
    } finally {
      this.loading = false;
    }
  }

  async checkHasUsers() {
    try {
      const res = await api<{ hasUsers: boolean }>('GET', '/api/auth/has-users');
      this.hasUsers = res.hasUsers;
    } catch {
      this.hasUsers = true;
    }
  }

  async login(username: string, password: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/login', { username, password });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async bootstrap(username: string, password: string, displayName: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/bootstrap', { username, password, displayName });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async signup(username: string, password: string, displayName: string, inviteCode: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/signup', {
      username, password, displayName, inviteCode
    });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async logout() {
    try {
      await api('POST', '/api/auth/logout');
    } catch { /* ignore */ }
    this.user = null;
    setSessionToken(null);
  }
}

export const authStore = new AuthStore();
```

**Step 2: Create bootstrap page**

`frontend/src/routes/bootstrap/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await authStore.bootstrap(username, password, displayName);
      goto('/channels');
    } catch (err: any) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-950">
  <div class="w-full max-w-sm p-6">
    <h1 class="text-2xl font-bold text-gray-100 mb-1">Create Admin Account</h1>
    <p class="text-sm text-gray-400 mb-6">Set up the first account for your Relay Chat instance.</p>

    {#if error}
      <div class="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded mb-4 text-sm">{error}</div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="username" class="block text-sm text-gray-400 mb-1">Username</label>
        <input id="username" type="text" bind:value={username} required autocomplete="username"
          class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label for="display-name" class="block text-sm text-gray-400 mb-1">Display Name</label>
        <input id="display-name" type="text" bind:value={displayName} autocomplete="name"
          class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label for="password" class="block text-sm text-gray-400 mb-1">Password</label>
        <input id="password" type="password" bind:value={password} required autocomplete="new-password"
          class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
      </div>
      <button type="submit" disabled={submitting} id="submit"
        class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium transition-colors">
        {submitting ? 'Creating...' : 'Create Account'}
      </button>
    </form>
  </div>
</div>
```

**Step 3: Create login page**

`frontend/src/routes/login/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let activeTab = $state<'login' | 'signup'>('login');
  let username = $state('');
  let password = $state('');
  let displayName = $state('');
  let inviteCode = $state('');
  let error = $state('');
  let submitting = $state(false);

  // Check for invite code in URL
  $effect(() => {
    const code = $page.url.searchParams.get('code');
    if (code) {
      inviteCode = code;
      activeTab = 'signup';
    }
  });

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await authStore.login(username, password);
      goto('/channels');
    } catch (err: any) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }

  async function handleSignup(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await authStore.signup(username, password, displayName, inviteCode);
      goto('/channels');
    } catch (err: any) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-950">
  <div class="w-full max-w-sm p-6">
    <h1 class="text-2xl font-bold text-gray-100 mb-6">Relay Chat</h1>

    <div class="flex gap-2 mb-6">
      <button data-tab="login" onclick={() => activeTab = 'login'}
        class="px-4 py-1.5 rounded text-sm font-medium transition-colors {activeTab === 'login' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}">
        Log In
      </button>
      <button data-tab="signup" onclick={() => activeTab = 'signup'}
        class="px-4 py-1.5 rounded text-sm font-medium transition-colors {activeTab === 'signup' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}">
        Sign Up
      </button>
    </div>

    {#if error}
      <div class="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded mb-4 text-sm">{error}</div>
    {/if}

    {#if activeTab === 'login'}
      <form id="login-card" onsubmit={handleLogin} class="space-y-4">
        <div>
          <label for="username" class="block text-sm text-gray-400 mb-1">Username</label>
          <input id="username" type="text" bind:value={username} required autocomplete="username"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label for="password" class="block text-sm text-gray-400 mb-1">Password</label>
          <input id="password" type="password" bind:value={password} required autocomplete="current-password"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={submitting} id="submit"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium transition-colors">
          {submitting ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    {:else}
      <form id="signup-card" onsubmit={handleSignup} class="space-y-4">
        <div>
          <label for="username" class="block text-sm text-gray-400 mb-1">Username</label>
          <input id="username" type="text" bind:value={username} required autocomplete="username"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label for="display-name" class="block text-sm text-gray-400 mb-1">Display Name</label>
          <input id="display-name" type="text" bind:value={displayName} autocomplete="name"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label for="password" class="block text-sm text-gray-400 mb-1">Password</label>
          <input id="password" type="password" bind:value={password} required autocomplete="new-password"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label for="invite-code" class="block text-sm text-gray-400 mb-1">Invite Code</label>
          <input id="invite-code" type="text" bind:value={inviteCode} required
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={submitting} id="submit"
          class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium transition-colors">
          {submitting ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>
    {/if}
  </div>
</div>
```

**Step 4: Create signup redirect page (for /invite/[code] URLs)**

`frontend/src/routes/invite/[code]/+page.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  redirect(307, `/login?code=${params.code}`);
};
```

`frontend/src/routes/invite/[code]/+page.svelte`:
```svelte
<p>Redirecting...</p>
```

**Step 5: Update root layout with auth guard**

`frontend/src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let { children } = $props();

  const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite'];

  $effect(() => {
    authStore.checkHasUsers().then(() => {
      authStore.checkAuth().then(() => {
        const path = $page.url.pathname;
        const isPublic = publicRoutes.some(r => path.startsWith(r));

        if (!authStore.loading) {
          if (!authStore.hasUsers && path !== '/bootstrap') {
            goto('/bootstrap');
          } else if (!authStore.isLoggedIn && !isPublic) {
            goto('/login');
          } else if (authStore.isLoggedIn && isPublic) {
            goto('/channels');
          }
        }
      });
    });
  });
</script>

{#if authStore.loading}
  <div class="flex items-center justify-center h-screen bg-gray-950">
    <div class="text-gray-400">Loading...</div>
  </div>
{:else}
  {@render children()}
{/if}
```

**Step 6: Update root page to redirect**

`frontend/src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  $effect(() => {
    if (!authStore.loading) {
      if (authStore.isLoggedIn) {
        goto('/channels');
      } else {
        goto('/login');
      }
    }
  });
</script>
```

**Step 7: Verify dev server runs and login page renders**

```bash
cd frontend && bun run dev
# Visit http://localhost:5173 — should redirect to /login or /bootstrap
```

**Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: add auth store and login/bootstrap/signup screens"
```

---

### Task 4: Channel Store and Sidebar Layout

**Files:**
- Create: `frontend/src/lib/stores/channels.ts`
- Create: `frontend/src/routes/channels/+layout.svelte`
- Create: `frontend/src/routes/channels/+page.svelte`
- Create: `frontend/src/lib/components/Sidebar.svelte`

**Step 1: Create channel store**

`frontend/src/lib/stores/channels.ts`:
```ts
import { api } from '$lib/api';
import type { Channel } from '$lib/types';

class ChannelStore {
  channels = $state<Channel[]>([]);
  activeChannelId = $state<number | null>(null);

  get activeChannel(): Channel | undefined {
    return this.channels.find(c => c.id === this.activeChannelId);
  }

  async load() {
    this.channels = await api<Channel[]>('GET', '/api/channels');
  }

  setActive(id: number) {
    this.activeChannelId = id;
  }

  async create(name: string): Promise<Channel> {
    const channel = await api<Channel>('POST', '/api/channels', { name });
    this.channels = [...this.channels, channel];
    return channel;
  }

  async markRead(channelId: number, messageId: number) {
    await api('POST', `/api/channels/${channelId}/read`, { messageId });
    this.channels = this.channels.map(c =>
      c.id === channelId ? { ...c, unreadCount: 0, hasMention: false } : c
    );
  }

  updateUnread(channelId: number, increment: number, hasMention?: boolean) {
    this.channels = this.channels.map(c => {
      if (c.id !== channelId) return c;
      return {
        ...c,
        unreadCount: (c.unreadCount || 0) + increment,
        hasMention: hasMention || c.hasMention
      };
    });
  }

  addChannel(channel: Channel) {
    if (!this.channels.find(c => c.id === channel.id)) {
      this.channels = [...this.channels, channel];
    }
  }
}

export const channelStore = new ChannelStore();
```

**Step 2: Create Sidebar component**

`frontend/src/lib/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { channelStore } from '$lib/stores/channels';

  let showCreateChannel = $state(false);
  let newChannelName = $state('');
  let createError = $state('');

  function formatChannelInput(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }

  async function createChannel() {
    createError = '';
    const name = formatChannelInput(newChannelName);
    if (!name) return;
    try {
      const channel = await channelStore.create(name);
      showCreateChannel = false;
      newChannelName = '';
      goto(`/channels/${channel.id}`);
    } catch (err: any) {
      createError = err.message;
    }
  }

  async function handleLogout() {
    await authStore.logout();
    goto('/login');
  }
</script>

<aside class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-60 shrink-0">
  <!-- Header -->
  <div class="p-3 border-b border-gray-800">
    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wide">Channels</h2>
  </div>

  <!-- Channel list -->
  <nav class="flex-1 overflow-y-auto p-2 space-y-0.5">
    {#each channelStore.channels as channel (channel.id)}
      <button
        onclick={() => goto(`/channels/${channel.id}`)}
        class="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors
          {channelStore.activeChannelId === channel.id ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}"
      >
        <span class="truncate"># {channel.name}</span>
        {#if channel.unreadCount && channel.unreadCount > 0}
          <span class="ml-2 shrink-0 {channel.hasMention ? 'bg-red-600' : 'bg-gray-600'} text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
            {channel.hasMention ? '@' : channel.unreadCount}
          </span>
        {/if}
      </button>
    {/each}

    <button onclick={() => showCreateChannel = true}
      class="w-full flex items-center px-2 py-1.5 rounded text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
      + Create Channel
    </button>
  </nav>

  <!-- Bottom -->
  <div class="p-3 border-t border-gray-800 space-y-2">
    <button onclick={() => goto('/threads')} class="w-full text-left text-sm text-gray-400 hover:text-gray-200 px-2 py-1">
      My Threads
    </button>
    <button onclick={() => goto('/settings')} class="w-full text-left text-sm text-gray-400 hover:text-gray-200 px-2 py-1">
      Settings
    </button>
    {#if authStore.isAdmin}
      <button id="open-admin" onclick={() => goto('/settings')} class="w-full text-left text-sm text-gray-400 hover:text-gray-200 px-2 py-1">
        Admin Panel
      </button>
    {/if}
    <div class="flex items-center justify-between px-2">
      <span class="text-xs text-gray-500">{authStore.user?.displayName || authStore.user?.username}</span>
      <button onclick={handleLogout} class="text-xs text-gray-500 hover:text-gray-300">Logout</button>
    </div>
  </div>

  <!-- Create channel modal -->
  {#if showCreateChannel}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick|self={() => showCreateChannel = false}>
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 w-80">
        <h3 class="text-gray-100 font-medium mb-3">Create Channel</h3>
        {#if createError}
          <div class="text-red-400 text-sm mb-2">{createError}</div>
        {/if}
        <input type="text" bind:value={newChannelName} placeholder="channel-name"
          oninput={(e) => newChannelName = formatChannelInput(e.currentTarget.value)}
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 text-sm mb-3 focus:border-blue-500 focus:outline-none" />
        <div class="flex justify-end gap-2">
          <button onclick={() => { showCreateChannel = false; newChannelName = ''; }}
            class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button onclick={createChannel}
            class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded">Create</button>
        </div>
      </div>
    </div>
  {/if}
</aside>
```

**Step 3: Create channels layout**

`frontend/src/routes/channels/+layout.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { channelStore } from '$lib/stores/channels';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { isMobile } from '$lib/utils/platform';

  let { children } = $props();
  let sidebarOpen = $state(!isMobile());

  onMount(() => {
    channelStore.load();
  });
</script>

<div class="flex h-screen bg-gray-950 text-gray-200">
  <!-- Mobile sidebar toggle -->
  <button id="sidebar-toggle"
    class="md:hidden fixed top-3 left-3 z-40 p-1.5 rounded bg-gray-800/80 text-gray-300"
    onclick={() => sidebarOpen = !sidebarOpen}>
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  </button>

  <!-- Mobile backdrop -->
  {#if sidebarOpen}
    <div id="sidebar-backdrop" class="md:hidden fixed inset-0 bg-black/50 z-30" onclick={() => sidebarOpen = false}></div>
  {/if}

  <!-- Sidebar -->
  <div class="fixed md:static z-30 h-full transition-transform duration-200
    {sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}">
    <Sidebar />
  </div>

  <!-- Main content -->
  <main class="flex-1 flex flex-col min-w-0">
    {@render children()}
  </main>
</div>
```

**Step 4: Create channel placeholder page**

`frontend/src/routes/channels/+page.svelte`:
```svelte
<div class="flex items-center justify-center h-full text-gray-500">
  <p>Select a channel to start chatting</p>
</div>
```

**Step 5: Verify sidebar renders with channels**

```bash
cd frontend && bun run dev
# Start Go backend: make dev (in another terminal)
# Visit http://localhost:5173 — should show login, then channel sidebar after auth
```

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add channel store and sidebar layout"
```

---

### Task 5: Message Store, Message Component, MessageList, and MessageInput

**Files:**
- Create: `frontend/src/lib/stores/messages.ts`
- Create: `frontend/src/lib/utils/markdown.ts`
- Create: `frontend/src/lib/utils/time.ts`
- Create: `frontend/src/lib/components/Message.svelte`
- Create: `frontend/src/lib/components/LinkPreview.svelte`
- Create: `frontend/src/lib/components/MessageList.svelte`
- Create: `frontend/src/lib/components/MessageInput.svelte`
- Create: `frontend/src/routes/channels/[id]/+page.svelte`

**Step 1: Create utility modules**

`frontend/src/lib/utils/markdown.ts`:
```ts
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true
});

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
marked.use({ renderer });

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

`frontend/src/lib/utils/time.ts`:
```ts
export function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeTime(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
```

**Step 2: Create message store**

`frontend/src/lib/stores/messages.ts`:
```ts
import { api } from '$lib/api';
import type { Message } from '$lib/types';

class MessageStore {
  /** Messages keyed by channel ID */
  byChannel = $state<Record<number, Message[]>>({});

  getMessages(channelId: number): Message[] {
    return this.byChannel[channelId] || [];
  }

  async loadChannel(channelId: number) {
    const msgs = await api<Message[]>('GET', `/api/channels/${channelId}/messages?limit=50`);
    this.byChannel[channelId] = msgs;
  }

  async send(channelId: number, content: string) {
    await api('POST', `/api/channels/${channelId}/messages`, { content });
  }

  addMessage(msg: Message) {
    const channelId = msg.channelId;
    const existing = this.byChannel[channelId] || [];
    if (existing.find(m => m.id === msg.id)) return;
    this.byChannel[channelId] = [...existing, msg];
  }

  updateReaction(messageId: number, emoji: string, userId: number, add: boolean) {
    for (const channelId of Object.keys(this.byChannel)) {
      const msgs = this.byChannel[Number(channelId)];
      const idx = msgs.findIndex(m => m.id === messageId);
      if (idx === -1) continue;

      const msg = { ...msgs[idx] };
      const reactions = [...(msg.reactions || [])];
      const rIdx = reactions.findIndex(r => r.emoji === emoji);

      if (add) {
        if (rIdx >= 0) {
          reactions[rIdx] = {
            ...reactions[rIdx],
            count: reactions[rIdx].count + 1,
            userIds: [...reactions[rIdx].userIds, userId]
          };
        } else {
          reactions.push({ emoji, count: 1, userIds: [userId] });
        }
      } else if (rIdx >= 0) {
        const newCount = reactions[rIdx].count - 1;
        if (newCount <= 0) {
          reactions.splice(rIdx, 1);
        } else {
          reactions[rIdx] = {
            ...reactions[rIdx],
            count: newCount,
            userIds: reactions[rIdx].userIds.filter(id => id !== userId)
          };
        }
      }

      msg.reactions = reactions;
      const newMsgs = [...msgs];
      newMsgs[idx] = msg;
      this.byChannel[Number(channelId)] = newMsgs;
      break;
    }
  }

  incrementReplyCount(parentId: number) {
    for (const channelId of Object.keys(this.byChannel)) {
      const msgs = this.byChannel[Number(channelId)];
      const idx = msgs.findIndex(m => m.id === parentId);
      if (idx === -1) continue;
      const newMsgs = [...msgs];
      newMsgs[idx] = { ...newMsgs[idx], replyCount: (newMsgs[idx].replyCount || 0) + 1 };
      this.byChannel[Number(channelId)] = newMsgs;
      break;
    }
  }
}

export const messageStore = new MessageStore();
```

**Step 3: Create LinkPreview component**

`frontend/src/lib/components/LinkPreview.svelte`:
```svelte
<script lang="ts">
  import type { LinkPreview } from '$lib/types';

  let { preview }: { preview: LinkPreview } = $props();
</script>

{#if preview.title || preview.description}
  <a href={preview.url} target="_blank" rel="noopener noreferrer"
    class="block mt-2 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors max-w-md">
    {#if preview.image}
      <img src={preview.image} alt="" class="w-full h-32 object-cover" />
    {/if}
    <div class="p-3">
      {#if preview.title}
        <div class="text-sm font-medium text-blue-400 truncate">{preview.title}</div>
      {/if}
      {#if preview.description}
        <div class="text-xs text-gray-400 mt-1 line-clamp-2">{preview.description}</div>
      {/if}
    </div>
  </a>
{/if}
```

**Step 4: Create Message component**

`frontend/src/lib/components/Message.svelte`:
```svelte
<script lang="ts">
  import type { Message as MessageType } from '$lib/types';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import { authStore } from '$lib/stores/auth';
  import { api } from '$lib/api';
  import LinkPreview from './LinkPreview.svelte';

  let { message, onOpenThread, onReactionChange }: {
    message: MessageType;
    onOpenThread?: (id: number) => void;
    onReactionChange?: () => void;
  } = $props();

  const REACTION_EMOJIS = ['👍', '👎', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀', '🙏'];
  let showPicker = $state(false);

  async function toggleReaction(emoji: string) {
    const reaction = message.reactions?.find(r => r.emoji === emoji);
    const isMine = reaction?.userIds.includes(authStore.user!.id);
    try {
      if (isMine) {
        await api('DELETE', `/api/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`);
      } else {
        await api('POST', `/api/messages/${message.id}/reactions`, { emoji });
      }
      onReactionChange?.();
    } catch { /* ignore */ }
  }

  function addReactionFromPicker(emoji: string) {
    showPicker = false;
    toggleReaction(emoji);
  }
</script>

<div class="message group px-4 py-1.5 hover:bg-gray-900/50 transition-colors">
  <div class="flex items-baseline gap-2">
    <span class="font-medium text-gray-200 text-sm">
      {message.displayName || message.username}
    </span>
    {#if message.isBot}
      <span class="text-[10px] bg-gray-700 text-gray-400 px-1 rounded uppercase">bot</span>
    {/if}
    <span class="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
  </div>

  <div class="msg-body text-sm text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none
    [&_a]:text-blue-400 [&_a]:underline [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:rounded
    [&_pre]:bg-gray-800 [&_pre]:p-3 [&_pre]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-400">
    {@html renderMarkdown(message.content)}
  </div>

  <!-- Link Previews -->
  {#if message.linkPreviews?.length}
    {#each message.linkPreviews as preview}
      <LinkPreview {preview} />
    {/each}
  {/if}

  <!-- Reactions -->
  {#if message.reactions?.length || true}
    <div class="flex items-center gap-1 mt-1 flex-wrap">
      {#each message.reactions || [] as reaction}
        <button onclick={() => toggleReaction(reaction.emoji)}
          class="reaction-pill inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors
            {reaction.userIds.includes(authStore.user?.id || 0) ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}">
          <span>{reaction.emoji}</span>
          <span class="reaction-count">{reaction.count}</span>
        </button>
      {/each}

      <!-- Add reaction button -->
      <div class="relative">
        <button class="reaction-add-btn opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-300 text-xs px-1"
          onclick={() => showPicker = !showPicker}>
          +
        </button>
        {#if showPicker}
          <div class="reaction-picker absolute bottom-full left-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg p-2 grid grid-cols-5 gap-1 z-20">
            {#each REACTION_EMOJIS as emoji}
              <button class="reaction-picker-btn hover:bg-gray-700 rounded p-1 text-base" onclick={() => addReactionFromPicker(emoji)}>
                {emoji}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Thread reply count -->
  {#if message.replyCount && message.replyCount > 0}
    <button class="reply-btn text-xs text-blue-400 hover:text-blue-300 mt-1"
      onclick={() => onOpenThread?.(message.id)}>
      {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
    </button>
  {:else}
    <button class="reply-btn opacity-0 group-hover:opacity-100 text-xs text-gray-500 hover:text-gray-300 mt-1 transition-opacity"
      onclick={() => onOpenThread?.(message.id)}>
      Reply
    </button>
  {/if}
</div>
```

**Step 5: Create MessageList component**

`frontend/src/lib/components/MessageList.svelte`:
```svelte
<script lang="ts">
  import type { Message as MessageType } from '$lib/types';
  import Message from './Message.svelte';

  let { messages, onOpenThread }: {
    messages: MessageType[];
    onOpenThread?: (id: number) => void;
  } = $props();

  let container: HTMLElement;

  function scrollToBottom() {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  $effect(() => {
    // Scroll to bottom when messages change
    if (messages.length) {
      // Use tick to wait for DOM update
      requestAnimationFrame(scrollToBottom);
    }
  });
</script>

<div bind:this={container} class="flex-1 overflow-y-auto" id="messages">
  <div class="py-2">
    {#each messages as message (message.id)}
      <Message {message} {onOpenThread} />
    {/each}
  </div>
</div>
```

**Step 6: Create MessageInput component**

`frontend/src/lib/components/MessageInput.svelte`:
```svelte
<script lang="ts">
  let { onSend, placeholder = 'Type a message...' }: {
    onSend: (content: string) => void;
    placeholder?: string;
  } = $props();

  let content = $state('');
  let inputEl: HTMLTextAreaElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend(trimmed);
    content = '';
    if (inputEl) inputEl.style.height = 'auto';
  }

  function autoResize() {
    if (inputEl) {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    }
  }
</script>

<div id="composer" class="p-3 border-t border-gray-800">
  <div class="flex items-end gap-2">
    <textarea
      bind:this={inputEl}
      bind:value={content}
      onkeydown={handleKeydown}
      oninput={autoResize}
      {placeholder}
      rows="1"
      id="msg-input"
      class="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-sm resize-none focus:border-blue-500 focus:outline-none"
      style="font-size: 16px;"
    ></textarea>
    <button id="msg-send" onclick={send}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shrink-0">
      Send
    </button>
  </div>
</div>
```

**Step 7: Create channel page**

`frontend/src/routes/channels/[id]/+page.svelte`:
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { messageStore } from '$lib/stores/messages';
  import { channelStore } from '$lib/stores/channels';
  import MessageList from '$lib/components/MessageList.svelte';
  import MessageInput from '$lib/components/MessageInput.svelte';

  let channelId = $derived(Number($page.params.id));
  let messages = $derived(messageStore.getMessages(channelId));
  let channel = $derived(channelStore.channels.find(c => c.id === channelId));

  $effect(() => {
    if (channelId) {
      channelStore.setActive(channelId);
      messageStore.loadChannel(channelId);
    }
  });

  // Mark channel read when viewing messages
  $effect(() => {
    if (messages.length && channelId) {
      const lastMsg = messages[messages.length - 1];
      channelStore.markRead(channelId, lastMsg.id);
    }
  });

  async function handleSend(content: string) {
    await messageStore.send(channelId, content);
  }

  function openThread(parentId: number) {
    // Thread panel will be added in Task 7
    goto(`/channels/${channelId}?thread=${parentId}`);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Channel header -->
  <header id="channel-header" class="px-4 py-3 border-b border-gray-800 flex items-center gap-2 shrink-0">
    <h2 id="channel-header-text" class="font-semibold text-gray-100">
      # {channel?.name || 'Loading...'}
    </h2>
  </header>

  <MessageList {messages} onOpenThread={openThread} />
  <MessageInput onSend={handleSend} />
</div>
```

**Step 8: Verify messages load and send**

```bash
cd frontend && bun run dev
# With Go backend running: make dev
# Login, select a channel, verify messages display and sending works
```

**Step 9: Commit**

```bash
git add frontend/src/
git commit -m "feat: add message store, message rendering, and channel view"
```

---

### Task 6: WebSocket Integration

**Files:**
- Create: `frontend/src/lib/ws.ts`
- Modify: `frontend/src/routes/channels/+layout.svelte`

**Step 1: Create WebSocket manager**

`frontend/src/lib/ws.ts`:
```ts
import { getWsUrl, isNative } from './utils/platform';
import { getSessionToken } from './api';
import { messageStore } from './stores/messages';
import { channelStore } from './stores/channels';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectDelay = 30000;
  connected = $state(false);

  connect() {
    const url = getWsUrl();
    const token = getSessionToken();

    let wsUrl = url;
    if (isNative() && token) {
      wsUrl += `?token=${token}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempt = 0;
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch { /* ignore parse errors */ }
    };
  }

  private handleEvent(data: any) {
    switch (data.type) {
      case 'new_message':
        messageStore.addMessage(data);
        if (data.channelId !== channelStore.activeChannelId) {
          const hasMention = data.mentions?.includes(
            /* current username checked in store */
          );
          channelStore.updateUnread(data.channelId, 1, false);
        }
        break;

      case 'new_reply':
        messageStore.incrementReplyCount(data.parentId);
        break;

      case 'reaction_added':
        messageStore.updateReaction(data.messageId, data.emoji, data.userId, true);
        break;

      case 'reaction_removed':
        messageStore.updateReaction(data.messageId, data.emoji, data.userId, false);
        break;

      case 'channel_created':
        channelStore.addChannel({ id: data.id, name: data.name });
        break;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export const wsManager = new WebSocketManager();
```

**Step 2: Integrate WebSocket into channels layout**

Add to `frontend/src/routes/channels/+layout.svelte` in the `<script>`:
```ts
import { wsManager } from '$lib/ws';
import { onDestroy } from 'svelte';

onMount(() => {
  channelStore.load();
  wsManager.connect();
});

onDestroy(() => {
  wsManager.disconnect();
});
```

Add connection status indicator in the template (inside the main div, before `</div>`):
```svelte
{#if !wsManager.connected}
  <div class="fixed bottom-4 right-4 bg-yellow-900/80 text-yellow-200 px-3 py-1.5 rounded text-xs z-50">
    Reconnecting...
  </div>
{/if}
```

**Step 3: Verify real-time messages work**

```bash
cd frontend && bun run dev
# Open two browser tabs, send a message in one — should appear in the other
```

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add WebSocket manager for real-time messaging"
```

---

### Task 7: Thread Store and Thread Panel

**Files:**
- Create: `frontend/src/lib/stores/threads.ts`
- Create: `frontend/src/lib/components/ThreadPanel.svelte`
- Modify: `frontend/src/routes/channels/[id]/+page.svelte`
- Create: `frontend/src/routes/threads/+page.svelte`

**Step 1: Create thread store**

`frontend/src/lib/stores/threads.ts`:
```ts
import { api } from '$lib/api';
import type { Message, ThreadSummary } from '$lib/types';

class ThreadStore {
  openThreadId = $state<number | null>(null);
  parentMessage = $state<Message | null>(null);
  replies = $state<Message[]>([]);
  muted = $state(false);
  myThreads = $state<ThreadSummary[]>([]);

  async openThread(parentId: number, parentMsg?: Message) {
    this.openThreadId = parentId;
    if (parentMsg) this.parentMessage = parentMsg;
    await this.loadReplies(parentId);
    await this.checkMuted(parentId);
  }

  closeThread() {
    this.openThreadId = null;
    this.parentMessage = null;
    this.replies = [];
  }

  async loadReplies(parentId: number) {
    this.replies = await api<Message[]>('GET', `/api/messages/${parentId}/thread?limit=50`);
  }

  async sendReply(parentId: number, content: string) {
    await api('POST', `/api/messages/${parentId}/reply`, { content });
  }

  addReply(reply: Message) {
    if (reply.parentId === this.openThreadId) {
      if (!this.replies.find(r => r.id === reply.id)) {
        this.replies = [...this.replies, reply];
      }
    }
  }

  async checkMuted(parentId: number) {
    try {
      const res = await api<{ muted: boolean }>('GET', `/api/threads/${parentId}/mute`);
      this.muted = res.muted;
    } catch {
      this.muted = false;
    }
  }

  async toggleMute() {
    if (!this.openThreadId) return;
    try {
      if (this.muted) {
        await api('DELETE', `/api/threads/${this.openThreadId}/mute`);
      } else {
        await api('POST', `/api/threads/${this.openThreadId}/mute`);
      }
      this.muted = !this.muted;
    } catch { /* ignore */ }
  }

  async loadMyThreads() {
    this.myThreads = await api<ThreadSummary[]>('GET', '/api/me/threads?limit=30');
  }
}

export const threadStore = new ThreadStore();
```

**Step 2: Create ThreadPanel component**

`frontend/src/lib/components/ThreadPanel.svelte`:
```svelte
<script lang="ts">
  import { threadStore } from '$lib/stores/threads';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatTime } from '$lib/utils/time';
  import Message from './Message.svelte';
  import MessageInput from './MessageInput.svelte';

  let { onClose }: { onClose: () => void } = $props();

  async function handleSendReply(content: string) {
    if (threadStore.openThreadId) {
      await threadStore.sendReply(threadStore.openThreadId, content);
    }
  }
</script>

<div id="thread-panel" class="flex flex-col h-full bg-gray-950 border-l border-gray-800">
  <!-- Thread header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
    <h3 class="font-semibold text-gray-100 text-sm">Thread</h3>
    <div class="flex items-center gap-2">
      <button onclick={() => threadStore.toggleMute()}
        class="text-sm text-gray-400 hover:text-gray-200" title={threadStore.muted ? 'Unmute' : 'Mute'}>
        {threadStore.muted ? '🔕' : '🔔'}
      </button>
      <button onclick={onClose} class="text-gray-400 hover:text-gray-200 text-lg">&times;</button>
    </div>
  </div>

  <!-- Parent message -->
  {#if threadStore.parentMessage}
    <div id="thread-parent" class="px-4 py-3 border-b border-gray-800 bg-gray-900/30">
      <div class="flex items-baseline gap-2 mb-1">
        <span class="font-medium text-gray-200 text-sm">{threadStore.parentMessage.displayName}</span>
        <span class="text-xs text-gray-500">{formatTime(threadStore.parentMessage.createdAt)}</span>
      </div>
      <div class="text-sm text-gray-300 prose prose-invert prose-sm max-w-none">
        {@html renderMarkdown(threadStore.parentMessage.content)}
      </div>
    </div>
  {/if}

  <!-- Replies -->
  <div class="thread-replies flex-1 overflow-y-auto py-2">
    {#each threadStore.replies as reply (reply.id)}
      <Message message={reply} />
    {/each}
  </div>

  <!-- Reply input -->
  <MessageInput onSend={handleSendReply} placeholder="Reply..." />
</div>
```

**Step 3: Integrate ThreadPanel into channel page**

Update `frontend/src/routes/channels/[id]/+page.svelte` to include the thread panel. The channel page becomes a flex container with messages on the left and optionally thread panel on the right. Also update the `openThread` function to actually use the threadStore.

See updated channel page (the key changes):
- Import `threadStore` and `ThreadPanel`
- When `openThread` is called, find the parent message and call `threadStore.openThread()`
- Render `ThreadPanel` conditionally based on `threadStore.openThreadId`
- Update `ws.ts` to dispatch `new_reply` events to `threadStore.addReply()`

**Step 4: Create My Threads page**

`frontend/src/routes/threads/+page.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { threadStore } from '$lib/stores/threads';
  import { formatRelativeTime } from '$lib/utils/time';

  onMount(() => {
    threadStore.loadMyThreads();
  });
</script>

<div class="flex flex-col h-full">
  <header class="px-4 py-3 border-b border-gray-800 shrink-0">
    <h2 class="font-semibold text-gray-100">My Threads</h2>
  </header>

  <div class="flex-1 overflow-y-auto p-4 space-y-2">
    {#each threadStore.myThreads as thread (thread.parentId)}
      <button onclick={() => goto(`/channels/${thread.channelId}?thread=${thread.parentId}`)}
        class="w-full text-left p-3 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">
        <div class="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <span>#{thread.channelName}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(thread.lastActivityAt)}</span>
        </div>
        <div class="text-sm text-gray-300 truncate">{thread.contentPreview}</div>
        <div class="text-xs text-gray-500 mt-1">{thread.replyCount} replies</div>
      </button>
    {/each}

    {#if !threadStore.myThreads.length}
      <p class="text-gray-500 text-center mt-8">No threads yet</p>
    {/if}
  </div>
</div>
```

Note: The `/threads` route needs a layout. Add it under `frontend/src/routes/threads/+layout.svelte` that reuses the channels layout with sidebar, OR nest it under the channels layout. Simplest: make `/threads` a sibling with its own layout that imports Sidebar.

**Step 5: Update WebSocket handler for thread replies**

In `frontend/src/lib/ws.ts`, add to the `new_reply` case:
```ts
case 'new_reply': {
  const { threadStore } = await import('./stores/threads');
  messageStore.incrementReplyCount(data.parentId);
  threadStore.addReply(data);
  break;
}
```

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add thread panel, thread store, and My Threads view"
```

---

### Task 8: Mention Autocomplete

**Files:**
- Create: `frontend/src/lib/components/MentionAutocomplete.svelte`
- Modify: `frontend/src/lib/components/MessageInput.svelte`

**Step 1: Create MentionAutocomplete component**

`frontend/src/lib/components/MentionAutocomplete.svelte`:
```svelte
<script lang="ts">
  import { api } from '$lib/api';
  import type { User } from '$lib/types';

  let { inputEl, onSelect }: {
    inputEl: HTMLTextAreaElement;
    onSelect: (username: string) => void;
  } = $props();

  let visible = $state(false);
  let users = $state<User[]>([]);
  let activeIndex = $state(0);
  let atPos = $state(-1);
  let debounceTimer: ReturnType<typeof setTimeout>;

  export function handleInput() {
    const value = inputEl.value;
    const cursor = inputEl.selectionStart || 0;

    // Scan backward for @
    let foundAt = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (value[i] === '@' && (i === 0 || /\s/.test(value[i - 1]))) {
        foundAt = i;
        break;
      }
      if (/\s/.test(value[i])) break;
    }

    if (foundAt === -1) {
      close();
      return;
    }

    const query = value.slice(foundAt + 1, cursor);
    if (query.length === 0) {
      close();
      return;
    }

    atPos = foundAt;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchUsers(query), 150);
  }

  async function fetchUsers(query: string) {
    try {
      users = await api<User[]>('GET', `/api/users/search?q=${encodeURIComponent(query)}`);
      visible = users.length > 0;
      activeIndex = 0;
    } catch {
      close();
    }
  }

  export function handleKeydown(e: KeyboardEvent): boolean {
    if (!visible) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % users.length;
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + users.length) % users.length;
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      select(activeIndex);
      return true;
    }
    if (e.key === 'Escape') {
      close();
      return true;
    }
    return false;
  }

  function select(index: number) {
    const user = users[index];
    if (!user) return;

    const value = inputEl.value;
    const cursor = inputEl.selectionStart || 0;
    const before = value.slice(0, atPos);
    const after = value.slice(cursor);
    const newValue = `${before}@${user.username} ${after}`;

    onSelect(newValue);
    close();
  }

  function close() {
    visible = false;
    users = [];
    activeIndex = 0;
  }
</script>

{#if visible}
  <div class="absolute bottom-full left-0 mb-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-30">
    {#each users as user, i (user.id)}
      <button
        class="w-full text-left px-3 py-2 text-sm transition-colors {i === activeIndex ? 'bg-gray-700' : 'hover:bg-gray-700/50'}"
        onclick={() => select(i)}>
        <span class="text-gray-200">{user.username}</span>
        {#if user.displayName}
          <span class="text-gray-500 ml-1">{user.displayName}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
```

**Step 2: Integrate into MessageInput**

Update `MessageInput.svelte` to import and use MentionAutocomplete. Add a `<div class="relative">` wrapper around the textarea, place the autocomplete component inside, and wire up `handleInput`/`handleKeydown` to the textarea events.

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add @mention autocomplete for message input"
```

---

### Task 9: Settings Page

**Files:**
- Create: `frontend/src/routes/settings/+page.svelte`
- Create: `frontend/src/routes/settings/+layout.svelte` (reuses sidebar)

**Step 1: Create settings layout (reuse sidebar)**

The settings page needs the sidebar. Since it's outside `/channels/`, either:
- Move the sidebar to the root layout (visible on all authenticated pages), or
- Create a shared layout group

Simplest approach: Create a layout group `(app)` that contains both `channels/` and `settings/` and `threads/` routes with the sidebar.

Restructure routes:
```
src/routes/
├── +layout.svelte          # Root: auth guard
├── +layout.ts              # ssr = false
├── +page.svelte            # Redirect
├── login/+page.svelte
├── bootstrap/+page.svelte
├── invite/[code]/+page.svelte
└── (app)/
    ├── +layout.svelte      # Sidebar + WebSocket
    ├── channels/
    │   ├── +page.svelte    # "Select a channel"
    │   └── [id]/+page.svelte
    ├── threads/+page.svelte
    └── settings/+page.svelte
```

Move the channels layout content (sidebar, WS connection, mobile toggle) into `(app)/+layout.svelte`.

**Step 2: Create settings page**

`frontend/src/routes/(app)/settings/+page.svelte` — a single page with sections for:

1. **Notification Preferences** — 3 checkboxes (notify mentions, thread replies, all messages) + save button
2. **Admin: General Settings** — Base URL input + save
3. **Admin: Push Notifications** — ntfy server URL input + save
4. **Admin: Invites** — Create invite button + invite list with copy buttons
5. **Admin: Bots** — Create bot + bot list with manage buttons + modals for token/binding management

This is a large component. Key API calls:
- `GET/POST /api/notifications/settings`
- `GET/POST /api/admin/settings`
- `POST /api/invites`, `GET /api/invites`
- `POST/GET/DELETE /api/bots`, `POST/GET/DELETE /api/bots/{id}/tokens`, `POST/GET/DELETE /api/bots/{id}/bindings`

**Step 3: Add important element IDs for E2E tests**

Ensure these IDs exist in the settings page HTML:
- `#notify-mentions`, `#notify-thread-replies`, `#notify-all-messages` (checkboxes)
- `#create-invite`, `#invite-result` (invite section)
- `#toggle-admin` or `#open-admin` (admin panel toggle)

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add settings page with notifications, admin, invites, and bots"
```

---

### Task 10: PWA Service Worker

**Files:**
- Create: `frontend/src/service-worker.ts`

**Step 1: Create service worker using SvelteKit's built-in support**

`frontend/src/service-worker.ts`:
```ts
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API, WebSocket, and relay requests
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/ws') ||
      url.pathname.startsWith('/relay')) {
    return;
  }

  // Navigation: network first, fallback to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html') as Promise<Response>)
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)) as Promise<Response>
  );
});
```

**Step 2: Register service worker in root layout (web only)**

In the root `+layout.svelte`, add service worker registration for web (not native):
```ts
import { isNative } from '$lib/utils/platform';
import { onMount } from 'svelte';

onMount(() => {
  if ('serviceWorker' in navigator && !isNative()) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
});
```

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add PWA service worker with offline support"
```

---

### Task 11: Capacitor / Mobile Integration

**Files:**
- Modify: `frontend/src/routes/(app)/+layout.svelte` (add native push, back button, swipe gestures)
- Create: `frontend/src/lib/utils/native.ts` (push registration, back button)
- Modify: `frontend/src/routes/+layout.svelte` (add server config screen for native)

**Step 1: Create native utilities**

`frontend/src/lib/utils/native.ts`:
```ts
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { api, getSessionToken } from '$lib/api';
import { isNative } from './platform';

export async function registerNativePush(userId: number) {
  if (!isNative()) return;

  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt') {
      await PushNotifications.requestPermissions();
    }

    await PushNotifications.register();

    let ntfyTopic = localStorage.getItem('ntfyTopic');
    if (!ntfyTopic) {
      ntfyTopic = 'relaychat-' + userId + '-' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('ntfyTopic', ntfyTopic);
    }

    await api('POST', '/api/push/subscribe', {
      ntfyTopic,
      platform: 'android'
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const clickUrl = notification.notification?.data?.click;
      if (clickUrl) {
        try {
          const url = new URL(clickUrl);
          window.location.hash = url.hash;
        } catch { /* ignore */ }
      }
    });
  } catch { /* ignore */ }
}

export async function unregisterNativePush() {
  if (!isNative()) return;
  const ntfyTopic = localStorage.getItem('ntfyTopic');
  if (ntfyTopic) {
    try {
      await api('DELETE', '/api/push/subscribe', { ntfyTopic });
    } catch { /* ignore */ }
  }
}

export function setupBackButton(callbacks: {
  closeThread: () => boolean;
  closeSidebar: () => boolean;
  goBack: () => boolean;
}) {
  if (!isNative()) return;

  CapApp.addListener('backButton', () => {
    if (callbacks.closeThread()) return;
    if (callbacks.closeSidebar()) return;
    if (callbacks.goBack()) return;
    CapApp.minimizeApp();
  });
}
```

**Step 2: Add server config screen for native app**

If the app is native and no `serverUrl` is set, show a server URL configuration screen. Add this to the root `+layout.svelte` or as a separate `/server-config` route.

**Step 3: Add swipe gesture support**

In the `(app)` layout, add touch event listeners for swipe-to-open-sidebar on mobile native.

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Capacitor mobile integration (push, back button, swipe)"
```

---

### Task 12: Route Group Restructure and Polish

**Files:**
- Restructure routes into `(app)/` layout group
- Ensure all E2E test element IDs are present
- Add browser notification support (web only)

**Step 1: Restructure routes**

Move `channels/`, `threads/`, `settings/` under `(app)/` layout group that provides the sidebar and WebSocket connection.

**Step 2: Add element IDs required by E2E tests**

Audit existing E2E tests and ensure these IDs/classes exist:
- Auth: `#username`, `#password`, `#submit`, `.auth-tab[data-tab]`, `#signup-card`, `#login-card`
- Chat: `#channel-header`, `#channel-header-text`, `.channel-list`, `.message`, `.msg-body`, `#msg-input`, `#msg-send`
- Admin: `#toggle-admin`, `#open-admin`, `#create-invite`, `#invite-result`
- Threads: `#thread-panel`, `.reply-btn`, `#reply-input`, `#reply-send`, `.thread-replies`
- Reactions: `.reaction-add-btn`, `.reaction-picker`, `.reaction-picker-btn`, `.reaction-pill`, `.reaction-count`
- Mobile: `#sidebar-toggle`, `#sidebar-backdrop`, `#composer`

**Step 3: Add browser notifications (web only)**

In the `(app)` layout, request notification permission and show browser notifications for new messages when the tab is hidden.

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: restructure routes, add browser notifications, ensure E2E IDs"
```

---

### Task 13: Update Build Pipeline and Verify End-to-End

**Files:**
- Modify: `Makefile`
- Modify: `Dockerfile.fly`
- Verify: Full build + run + E2E tests

**Step 1: Update Makefile**

```makefile
frontend:
	cd frontend && bun install && bun run build
	rm -rf cmd/app/static/*
	cp -r frontend/dist/* cmd/app/static/
```

**Step 2: Update Dockerfile.fly**

The Dockerfile should work as-is since `bun run build` now calls `vite build`. Verify:
```bash
docker build -f Dockerfile.fly -t relay-chat-test .
```

**Step 3: Full build and manual smoke test**

```bash
make build
DATA_DIR=./tmp DEV_MODE=true ./relay-chat
# Visit http://localhost:8080 — verify all screens work
```

**Step 4: Run E2E tests**

```bash
make test-e2e
```

E2E tests will likely need selector updates since the DOM structure changed. Fix any failures — the tests validate real functionality.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: update build pipeline for SvelteKit frontend"
```

---

### Task 14: Update E2E Tests

**Files:**
- Modify: `tests/e2e/tests/e2e.spec.ts`
- Modify: `tests/e2e/tests/prod-smoke.spec.ts`
- Modify: `tests/e2e/tests/mobile-audit.spec.ts`
- Modify: `tests/e2e/tests/notification-settings.spec.ts`

**Step 1: Run existing tests and note failures**

```bash
make test-e2e 2>&1 | head -100
```

**Step 2: Update selectors**

The main changes:
- SvelteKit uses real URL paths (`/channels/1`) instead of hash routing (`#/channel/1`)
- DOM structure changes (Svelte components vs vanilla DOM manipulation)
- Element IDs should be preserved where possible (we added them in Task 12)
- Class names change from custom CSS to Tailwind utility classes

Update each test file to match the new DOM structure while keeping the test logic the same.

**Step 3: Run tests and fix any remaining failures**

```bash
make test-e2e
```

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update E2E tests for SvelteKit frontend"
```
