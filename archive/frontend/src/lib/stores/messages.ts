/**
 * Messages state store
 * Centralized message state management by channel
 */

import { writable, derived } from 'svelte/store';
import type { Message } from '$lib/types/api';

// Store messages by channel ID
type MessagesState = Record<string, Message[]>;

function createMessagesStore() {
  const { subscribe, set, update } = writable<MessagesState>({});

  return {
    subscribe,
    
    /**
     * Set all messages for a specific channel
     */
    setChannelMessages: (channelId: string, messages: Message[]) => {
      update(store => ({ ...store, [channelId]: messages }));
    },
    
    /**
     * Add a new message to a channel
     */
    addMessage: (channelId: string, message: Message) => {
      update(store => {
        const channelMessages = store[channelId] || [];
        return {
          ...store,
          [channelId]: [...channelMessages, message],
        };
      });
    },
    
    /**
     * Update an existing message (e.g., after edit)
     */
    updateMessage: (channelId: string, message: Message) => {
      update(store => {
        const channelMessages = store[channelId] || [];
        return {
          ...store,
          [channelId]: channelMessages.map(m => 
            m.id === message.id ? message : m
          ),
        };
      });
    },
    
    /**
     * Delete a message from a channel
     */
    deleteMessage: (channelId: string, messageId: string) => {
      update(store => {
        const channelMessages = store[channelId] || [];
        return {
          ...store,
          [channelId]: channelMessages.filter(m => m.id !== messageId),
        };
      });
    },
    
    /**
     * Clear all messages for a channel
     */
    clearChannel: (channelId: string) => {
      update(store => {
        const newStore = { ...store };
        delete newStore[channelId];
        return newStore;
      });
    },
    
    /**
     * Clear all messages from all channels
     */
    clearAll: () => {
      set({});
    },
  };
}

export const messages = createMessagesStore();

/**
 * Derived store to get messages for a specific channel
 */
export function getChannelMessages(channelId: string) {
  return derived(messages, $messages => $messages[channelId] || []);
}
