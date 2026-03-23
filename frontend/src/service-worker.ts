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
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

const DYNAMIC_BRANDING = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip API, WebSocket, and relay requests
	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/ws') ||
		url.pathname.startsWith('/relay')
	) {
		return;
	}

	// Network-first for dynamic branding assets (name + icons change at runtime)
	if (DYNAMIC_BRANDING.some((p) => url.pathname === p)) {
		event.respondWith(
			fetch(event.request).catch(() => caches.match(event.request) as Promise<Response>)
		);
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
		caches.match(event.request).then((cached) => cached || fetch(event.request)) as Promise<Response>
	);
});

// --- Web Push Notifications ---

sw.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			if (!event.data) {
				await sw.registration.showNotification('New message', {});
				return;
			}
			const data = event.data.json();
			await sw.registration.showNotification(data.title, data.options);

			// If this is a test notification, tell the page it arrived
			if (data.test) {
				const bc = new BroadcastChannel('push-test');
				bc.postMessage({ received: true });
				bc.close();
			}
		})()
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = event.notification.data?.path;
	if (!path) return;

	const url = new URL(path, sw.location.origin).href;

	event.waitUntil(
		sw.clients.matchAll({ type: 'window' }).then((clients) => {
			const focused = clients.find((c) => c.focused);
			if (focused) return focused.navigate(url);
			return sw.clients.openWindow(url);
		})
	);
});
