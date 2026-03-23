import { api } from './api';

let subscribed = $state(false);
let permissionState = $state<NotificationPermission>('default');

export const pushState = {
	get subscribed() { return subscribed; },
	get permission() { return permissionState; },
};

export async function initPush(): Promise<void> {
	if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;

	permissionState = Notification.permission;
	if (permissionState === 'denied') return;

	try {
		const reg = await navigator.serviceWorker.ready;
		const existing = await reg.pushManager.getSubscription();

		if (existing) {
			// Always sync existing subscription with the server on every app open.
			// The server endpoint is an upsert, so this is safe and catches stale records.
			await sendSubscriptionToServer(existing);
			subscribed = true;
			return;
		}

		// Subscription is null — try to recover it.

		// Request permission if not yet decided
		if (permissionState === 'default') {
			const result = await Notification.requestPermission();
			permissionState = result;
			if (result !== 'granted') return;
		}

		// If permission was already granted but subscription is missing (e.g. expired
		// endpoint, cleared browser data), re-subscribe automatically.
		if (permissionState === 'granted') {
			await subscribe(reg);
		} else {
			subscribed = false;
		}
	} catch (e) {
		console.error('Push init error:', e);
	}
}

export async function requestAndSubscribe(): Promise<void> {
	if (!('PushManager' in window)) return;

	const permission = await Notification.requestPermission();
	permissionState = permission;
	if (permission !== 'granted') return;

	try {
		const reg = await navigator.serviceWorker.ready;
		await subscribe(reg);
	} catch (e) {
		console.error('Push subscribe error:', e);
	}
}

export async function unsubscribePush(): Promise<void> {
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (sub) {
			const endpoint = sub.endpoint;
			await sub.unsubscribe();
			await api('DELETE', '/api/push/subscribe', { endpoint });
		}
		subscribed = false;
	} catch (e) {
		console.error('Push unsubscribe error:', e);
	}
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<void> {
	const { publicKey } = await api<{ publicKey: string }>('GET', '/api/push/vapid-key');

	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey),
	});

	await sendSubscriptionToServer(sub);
	subscribed = true;
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
	const key = sub.getKey('p256dh');
	const auth = sub.getKey('auth');
	if (!key || !auth) return;

	await api('POST', '/api/push/subscribe', {
		endpoint: sub.endpoint,
		p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
		auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
	});
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
