import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { isNative } from './platform';

let notificationIdCounter = 0;

/**
 * Initialize native notification system:
 * 1. Request POST_NOTIFICATIONS permission (Android 13+)
 * 2. Set up tap listener for deep linking
 * 3. Start foreground service to keep WebSocket alive in background
 */
export async function initNativeNotifications(): Promise<void> {
  if (!isNative()) return;

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display === 'prompt') {
      const result = await LocalNotifications.requestPermissions();
      if (result.display === 'denied') {
        console.warn('Notification permission denied');
      }
    }

    // Navigate to channel/thread when notification is tapped
    await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        const extra = event.notification?.extra;
        if (!extra) return;

        if (extra.threadId && extra.channelId) {
          window.location.href = `/channels/${extra.channelId}?thread=${extra.threadId}`;
        } else if (extra.channelId) {
          window.location.href = `/channels/${extra.channelId}`;
        }
      }
    );

    // Keep the app process alive when backgrounded
    await ForegroundService.startForegroundService({
      id: 1000,
      title: 'Relay Chat',
      body: 'Connected',
      smallIcon: 'ic_notification',
      silent: true,
    });
  } catch (e) {
    console.error('Failed to init native notifications:', e);
  }
}

/**
 * Show a native local notification (called from WS handler when app is backgrounded).
 */
export async function showNativeNotification(
  title: string,
  body: string,
  data?: { channelId?: number; threadId?: number }
): Promise<void> {
  if (!isNative()) return;

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') return;

    notificationIdCounter += 1;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationIdCounter,
          title,
          body,
          smallIcon: 'ic_notification',
          extra: data || {},
        },
      ],
    });
  } catch {
    // Ignore notification errors
  }
}

/**
 * Stop the foreground service (call on logout).
 */
export async function stopNativeNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    await ForegroundService.stopForegroundService();
    await LocalNotifications.removeAllListeners();
  } catch {
    // Ignore stop errors
  }
}

/**
 * Android back button handler.
 */
export function setupBackButton(callbacks: {
  closeThread: () => boolean;
  closeSidebar: () => boolean;
  goBack: () => boolean;
}): void {
  if (!isNative()) return;
  CapApp.addListener('backButton', () => {
    if (callbacks.closeThread()) return;
    if (callbacks.closeSidebar()) return;
    if (callbacks.goBack()) return;
    CapApp.minimizeApp();
  });
}
