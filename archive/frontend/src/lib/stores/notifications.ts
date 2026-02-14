/**
 * Notifications store
 * Toast notification system to replace alert() calls
 */

import { writable } from 'svelte/store';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timeout?: number;
}

function createNotificationsStore() {
  const { subscribe, update } = writable<Notification[]>([]);

  return {
    subscribe,
    
    /**
     * Show a notification
     */
    show: (type: NotificationType, message: string, timeout = 5000) => {
      const id = Math.random().toString(36).substring(2, 11);
      const notification: Notification = { id, type, message, timeout };
      
      update(notifications => [...notifications, notification]);
      
      if (timeout > 0) {
        setTimeout(() => {
          update(notifications => notifications.filter(n => n.id !== id));
        }, timeout);
      }
      
      return id;
    },
    
    /**
     * Dismiss a notification by ID
     */
    dismiss: (id: string) => {
      update(notifications => notifications.filter(n => n.id !== id));
    },
    
    /**
     * Clear all notifications
     */
    clearAll: () => {
      update(() => []);
    },
    
    /**
     * Convenience methods for different notification types
     */
    info: (message: string, timeout?: number) => {
      return createNotificationsStore().show('info', message, timeout);
    },
    
    success: (message: string, timeout?: number) => {
      return createNotificationsStore().show('success', message, timeout);
    },
    
    warning: (message: string, timeout?: number) => {
      return createNotificationsStore().show('warning', message, timeout);
    },
    
    error: (message: string, timeout?: number) => {
      return createNotificationsStore().show('error', message, timeout);
    },
  };
}

export const notifications = createNotificationsStore();

// Convenience exports
export const showNotification = notifications.show;
export const dismissNotification = notifications.dismiss;
export const showInfo = (message: string, timeout?: number) => notifications.show('info', message, timeout);
export const showSuccess = (message: string, timeout?: number) => notifications.show('success', message, timeout);
export const showWarning = (message: string, timeout?: number) => notifications.show('warning', message, timeout);
export const showError = (message: string, timeout?: number) => notifications.show('error', message, timeout);
