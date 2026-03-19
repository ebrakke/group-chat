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
	if (!event.data) return;

	const handlePush = async () => {
		const data = event.data!.json();
		// Skip notification if user is actively looking at the app
		const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
		if (clients.some((c) => c.focused)) return;

		await sw.registration.showNotification(data.title, data.options);
	};

	event.waitUntil(handlePush());
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
