/**
 * Channels state store
 * Centralized channel state management
 */

import { writable, derived } from 'svelte/store';
import type { Channel } from '$lib/types/api';

function createChannelsStore() {
  const { subscribe, set, update } = writable<Channel[]>([]);

  return {
    subscribe,
    set,
    
    /**
     * Add a new channel
     */
    add: (channel: Channel) => {
      update(channels => [...channels, channel]);
    },
    
    /**
     * Update an existing channel
     */
    updateChannel: (updatedChannel: Channel) => {
      update(channels => 
        channels.map(c => c.id === updatedChannel.id ? updatedChannel : c)
      );
    },
    
    /**
     * Remove a channel
     */
    remove: (channelId: string) => {
      update(channels => channels.filter(c => c.id !== channelId));
    },
    
    /**
     * Find a channel by ID
     */
    findById: (channels: Channel[], channelId: string): Channel | undefined => {
      return channels.find(c => c.id === channelId);
    },
  };
}

export const channels = createChannelsStore();

/**
 * Derived store to get a specific channel by ID
 */
export function getChannel(channelId: string) {
  return derived(channels, $channels => 
    $channels.find(c => c.id === channelId)
  );
}
