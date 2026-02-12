import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate } from '$lib/server/auth-helper.js';
import {
  listChannels,
  getChannel,
  createChannelRecord,
  updateChannel,
  deleteChannel,
  channelExists,
} from '$lib/server/lib/channels.js';
import { getUserNostrPrivkey } from '$lib/server/lib/users.js';
import { getNostrClient, getWebSocketHandler } from '$lib/server/globals.js';

/**
 * GET /api/v1/channels
 * List all channels
 */
export async function GET({ request }: RequestEvent) {
  const { error } = authenticate(request);
  if (error) return error;

  try {
    const channels = listChannels();

    return json(
      channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        memberCount: 0,
      }))
    );
  } catch (err: any) {
    console.error('Channel list error:', err);
    return json({ error: err.message || 'Failed to list channels' }, { status: 500 });
  }
}

/**
 * POST /api/v1/channels
 * Create a new channel
 */
export async function POST({ request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;

  try {
    const body = await request.json();
    const { id, name, description } = body;

    if (!id || !name) {
      return json({ error: 'Missing required fields: id, name' }, { status: 400 });
    }

    // Validate channel ID format
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(id)) {
      return json({ error: 'Channel ID must be 2-30 characters, alphanumeric, dashes, or underscores' }, { status: 400 });
    }

    // Check if channel already exists
    if (channelExists(id)) {
      return json({ error: 'Channel ID already exists' }, { status: 409 });
    }

    // Create channel record
    const channel = createChannelRecord(id, name, description || '');

    // Publish NIP-29 group metadata to relay
    try {
      const nostrClient = getNostrClient();
      if (nostrClient && nostrClient.isConnected()) {
        const privkey = getUserNostrPrivkey(user!.id);
        await nostrClient.createChannel(id, name, description || '', privkey);
      }
    } catch (err) {
      console.error('Failed to publish channel to relay:', err);
    }

    // Broadcast channel creation
    const wsHandler = getWebSocketHandler();
    if (wsHandler) {
      wsHandler.broadcastChannelCreated({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        memberCount: 0,
      });
    }

    return json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      memberCount: 0,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Channel create error:', err);
    return json({ error: err.message || 'Failed to create channel' }, { status: 500 });
  }
}
