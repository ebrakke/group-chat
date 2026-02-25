import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '$lib/api';
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

    await api('POST', '/api/push/subscribe', { ntfyTopic, platform: 'android' });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const clickUrl = notification.notification?.data?.click;
      if (clickUrl) {
        try {
          const url = new URL(clickUrl);
          window.location.hash = url.hash;
        } catch {
          // ignore invalid URLs
        }
      }
    });
  } catch {
    // native push not available or denied
  }
}

export async function unregisterNativePush() {
  if (!isNative()) return;
  const ntfyTopic = localStorage.getItem('ntfyTopic');
  if (ntfyTopic) {
    try {
      await api('DELETE', '/api/push/subscribe', { ntfyTopic });
    } catch {
      // ignore unsubscribe errors
    }
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
