import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate, requireAdmin } from '$lib/server/auth-helper.js';
import {
  getChannel,
  updateChannel,
  deleteChannel,
} from '$lib/server/lib/channels.js';
import { getUserNostrPrivkey } from '$lib/server/lib/users.js';
import { getNostrClient, getWebSocketHandler } from '$lib/server/globals.js';

/**
 * GET /api/v1/channels/:channelId
 * Get channel details
 */
export async function GET({ params, request }: RequestEvent) {
  const { error } = authenticate(request);
  if (error) return error;

  try {
    const channel = getChannel(params.channelId!);
    if (!channel) {
      return json({ error: 'Channel not found' }, { status: 404 });
    }

    return json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      memberCount: 0,
    });
  } catch (err: any) {
    console.error('Channel get error:', err);
    return json({ error: err.message || 'Failed to get channel' }, { status: 500 });
  }
}

/**
 * PUT /api/v1/channels/:channelId
 * Update channel (admin only)
 */
export async function PUT({ params, request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;
  
  const adminError = requireAdmin(user!);
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const channel = updateChannel(params.channelId!, name, description || '');
    if (!channel) {
      return json({ error: 'Channel not found' }, { status: 404 });
    }

    // Publish update to relay
    try {
      const nostrClient = getNostrClient();
      if (nostrClient && nostrClient.isConnected()) {
        const privkey = getUserNostrPrivkey(user!.id);
        await nostrClient.updateChannelMetadata(params.channelId!, name, description || '', privkey);
      }
    } catch (err) {
      console.error('Failed to publish channel update:', err);
    }

    // Broadcast update
    const wsHandler = getWebSocketHandler();
    if (wsHandler) {
      wsHandler.broadcastChannelUpdated({
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
    });
  } catch (err: any) {
    console.error('Channel update error:', err);
    return json({ error: err.message || 'Failed to update channel' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/channels/:channelId
 * Delete channel (admin only)
 */
export async function DELETE({ params, request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;
  
  const adminError = requireAdmin(user!);
  if (adminError) return adminError;

  try {
    // Can't delete #general
    if (params.channelId === 'general') {
      return json({ error: 'Cannot delete #general channel' }, { status: 400 });
    }

    deleteChannel(params.channelId!);

    // Broadcast deletion
    const wsHandler = getWebSocketHandler();
    if (wsHandler) {
      wsHandler.broadcastChannelDeleted(params.channelId!);
    }

    return json({ message: 'Channel deleted successfully' });
  } catch (err: any) {
    console.error('Channel delete error:', err);
    return json({ error: err.message || 'Failed to delete channel' }, { status: 500 });
  }
}
