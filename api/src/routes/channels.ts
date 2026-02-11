import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  listChannels,
  getChannel,
  createChannelRecord,
  updateChannel,
  deleteChannel,
  channelExists,
} from '../lib/channels.js';
import { getUserNostrPrivkey } from '../lib/users.js';
import { getNostrClient } from '../index.js';
import { getDb } from '../db/schema.js';

export const channelRoutes = new Hono();

/**
 * GET /channels
 * List all channels
 */
channelRoutes.get('/', authMiddleware, async (c) => {
  try {
    const channels = listChannels();

    return c.json(
      channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        memberCount: 0, // TODO: Track membership when we implement NIP-29 properly
      }))
    );
  } catch (err: any) {
    console.error('Channel list error:', err);
    return c.json({ error: err.message || 'Failed to list channels' }, 500);
  }
});

/**
 * POST /channels
 * Create a new channel (admin only)
 */
channelRoutes.post('/', authMiddleware, adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { id, name, description } = body;

    if (!id || !name) {
      return c.json({ error: 'Missing required fields: id, name' }, 400);
    }

    // Validate channel ID format (alphanumeric, dashes, underscores)
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(id)) {
      return c.json({ error: 'Channel ID must be 2-30 characters, alphanumeric, dashes, or underscores' }, 400);
    }

    // Check if channel already exists
    if (channelExists(id)) {
      return c.json({ error: 'Channel ID already exists' }, 409);
    }

    // Create channel record
    const channel = createChannelRecord(id, name, description || '');

    // Publish NIP-29 group metadata to relay
    try {
      const nostrClient = getNostrClient();
      if (nostrClient.isConnected()) {
        const user = c.get('user');
        const privkey = getUserNostrPrivkey(user.id);
        await nostrClient.createChannel(id, name, description || '', privkey);
      }
    } catch (err) {
      console.error('Failed to publish channel to relay:', err);
      // Don't fail channel creation if Nostr publish fails
    }

    return c.json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
    }, 201);
  } catch (err: any) {
    console.error('Channel creation error:', err);
    return c.json({ error: err.message || 'Failed to create channel' }, 500);
  }
});

/**
 * PATCH /channels/:id
 * Update a channel (admin only)
 */
channelRoutes.patch('/:id', authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, description } = body;

    const existingChannel = getChannel(id);
    if (!existingChannel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    const updatedChannel = updateChannel(
      id,
      name || existingChannel.name,
      description !== undefined ? description : existingChannel.description
    );

    // TODO: Publish updated NIP-29 metadata to relay

    return c.json({
      id: updatedChannel.id,
      name: updatedChannel.name,
      description: updatedChannel.description,
    });
  } catch (err: any) {
    console.error('Channel update error:', err);
    return c.json({ error: err.message || 'Failed to update channel' }, 500);
  }
});

/**
 * DELETE /channels/:id
 * Delete a channel (admin only)
 */
channelRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = c.req.param('id');

    // Prevent deleting #general
    if (id === 'general') {
      return c.json({ error: 'Cannot delete #general channel' }, 400);
    }

    const channel = getChannel(id);
    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    deleteChannel(id);

    // TODO: Publish NIP-29 delete-group event to relay

    return c.json({ message: 'Channel deleted successfully' });
  } catch (err: any) {
    console.error('Channel deletion error:', err);
    return c.json({ error: err.message || 'Failed to delete channel' }, 500);
  }
});

/**
 * GET /channels/:id/members
 * List channel members
 */
channelRoutes.get('/:id/members', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');

    const channel = getChannel(id);
    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    // TODO: Query NIP-29 group members from relay
    return c.json([]);
  } catch (err: any) {
    console.error('Channel members error:', err);
    return c.json({ error: err.message || 'Failed to list members' }, 500);
  }
});

/**
 * GET /channels/:id/messages
 * Get channel messages
 */
channelRoutes.get('/:id/messages', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const before = c.req.query('before');
    const limit = parseInt(c.req.query('limit') || '50');

    const channel = getChannel(id);
    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Query messages from relay
    const events = await nostrClient.getChannelMessages(id, limit, before);
    
    // Get thread counts and reactions for all messages
    const messageIds = events.map(e => e.id);
    const threadCounts = await nostrClient.getThreadCounts(messageIds);
    const reactionsMap = await nostrClient.getReactions(messageIds);
    
    // Get database for user lookups
    const db = getDb();
    
    // Map pubkeys to user IDs for reactions
    const pubkeyToUserIdMap: Record<string, string> = {};
    const allPubkeys = new Set<string>();
    for (const reactions of Object.values(reactionsMap)) {
      for (const pubkeys of Object.values(reactions)) {
        pubkeys.forEach(pk => allPubkeys.add(pk));
      }
    }
    
    // Batch lookup user IDs for all pubkeys
    for (const pubkey of allPubkeys) {
      const user = db.prepare('SELECT id FROM users WHERE nostr_pubkey = ?').get(pubkey) as any;
      if (user) {
        pubkeyToUserIdMap[pubkey] = user.id;
      }
    }
    
    // Transform Nostr events to API message format
    const messages = events.map((event) => {
      // Get author info from database
      const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
        .get(event.pubkey) as any;
      
      // Parse attachments from imeta tags
      const attachments = event.tags
        .filter(tag => tag[0] === 'imeta')
        .map(tag => {
          const attachment: any = {};
          for (let i = 1; i < tag.length; i++) {
            const [key, value] = tag[i].split(' ', 2);
            if (key === 'url') attachment.url = value;
            if (key === 'm') attachment.mimeType = value;
            if (key === 'size') attachment.size = parseInt(value);
            if (key === 'name') attachment.filename = value;
          }
          return attachment;
        });
      
      // Check if this is an edit (has 'e' tag)
      const editTag = event.tags.find(tag => tag[0] === 'e');
      const isEdit = !!editTag;
      
      // Convert reactions from pubkeys to user IDs
      const reactions: Record<string, string[]> = {};
      const messageReactions = reactionsMap[event.id] || {};
      for (const [emoji, pubkeys] of Object.entries(messageReactions)) {
        reactions[emoji] = pubkeys
          .map(pk => pubkeyToUserIdMap[pk])
          .filter(Boolean);
      }
      
      return {
        id: event.id,
        channelId: id,
        author: author ? {
          id: author.id,
          username: author.username,
          displayName: author.display_name,
          nostrPubkey: author.nostr_pubkey,
        } : {
          id: 'unknown',
          username: 'unknown',
          displayName: 'Unknown User',
          nostrPubkey: event.pubkey,
        },
        content: event.content,
        attachments,
        reactions,
        threadCount: threadCounts[event.id] || 0,
        createdAt: new Date(event.created_at * 1000).toISOString(),
        editedAt: isEdit ? new Date(event.created_at * 1000).toISOString() : null,
      };
    });

    return c.json(messages);
  } catch (err: any) {
    console.error('Channel messages error:', err);
    return c.json({ error: err.message || 'Failed to fetch messages' }, 500);
  }
});

/**
 * POST /channels/:id/messages
 * Send a message to a channel
 */
channelRoutes.post('/:id/messages', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { content, attachments } = body;

    if (!content || content.trim().length === 0) {
      return c.json({ error: 'Message content required' }, 400);
    }

    const channel = getChannel(id);
    if (!channel) {
      return c.json({ error: 'Channel not found' }, 404);
    }

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Get user's private key
    const user = c.get('user');
    const privkey = getUserNostrPrivkey(user.id);

    // Publish message to relay
    const event = await nostrClient.publishMessage(id, content, privkey, attachments);

    // Return message in API format
    return c.json({
      id: event.id,
      channelId: id,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
      },
      content: event.content,
      attachments: attachments || [],
      reactions: {},
      threadCount: 0,
      createdAt: new Date(event.created_at * 1000).toISOString(),
      editedAt: null,
    }, 201);
  } catch (err: any) {
    console.error('Send message error:', err);
    return c.json({ error: err.message || 'Failed to send message' }, 500);
  }
});
