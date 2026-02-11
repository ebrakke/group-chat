import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { getUserNostrPrivkey } from '../lib/users.js';
import { getNostrClient } from '../index.js';
import { getDb } from '../db/schema.js';

export const messageRoutes = new Hono();

/**
 * PATCH /messages/:id
 * Edit a message (own messages only)
 */
messageRoutes.patch('/:id', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');
    const body = await c.req.json();
    const { content } = body;

    if (!content || content.trim().length === 0) {
      return c.json({ error: 'Message content required' }, 400);
    }

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Query the original message from relay to verify ownership
    const events = await nostrClient.queryEvents([{ ids: [messageId] }]);
    if (events.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const originalEvent = events[0];
    const user = c.get('user');

    // Verify ownership
    if (originalEvent.pubkey !== user.nostrPubkey) {
      return c.json({ error: 'You can only edit your own messages' }, 403);
    }

    // Get channel ID from 'h' tag
    const channelTag = originalEvent.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return c.json({ error: 'Invalid message: no channel tag' }, 400);
    }
    const channelId = channelTag[1];

    // Get user's private key
    const privkey = getUserNostrPrivkey(user.id);

    // Publish edit event
    const editEvent = await nostrClient.editMessage(channelId, messageId, content, privkey);

    return c.json({
      id: editEvent.id,
      channelId,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
      },
      content: editEvent.content,
      attachments: [], // Attachments are not preserved in edits for v1
      reactions: {},
      threadCount: 0,
      createdAt: new Date(originalEvent.created_at * 1000).toISOString(),
      editedAt: new Date(editEvent.created_at * 1000).toISOString(),
    });
  } catch (err: any) {
    console.error('Message edit error:', err);
    return c.json({ error: err.message || 'Failed to edit message' }, 500);
  }
});

/**
 * DELETE /messages/:id
 * Delete a message (own messages or admin)
 */
messageRoutes.delete('/:id', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Query the message from relay to verify ownership
    const events = await nostrClient.queryEvents([{ ids: [messageId] }]);
    if (events.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const originalEvent = events[0];
    const user = c.get('user');

    // Verify ownership or admin
    if (originalEvent.pubkey !== user.nostrPubkey && user.role !== 'admin') {
      return c.json({ error: 'You can only delete your own messages' }, 403);
    }

    // Get user's private key
    const privkey = getUserNostrPrivkey(user.id);

    // Publish deletion event
    await nostrClient.deleteMessage(messageId, privkey, 'Deleted by user');

    return c.json({ message: 'Message deleted successfully' });
  } catch (err: any) {
    console.error('Message deletion error:', err);
    return c.json({ error: err.message || 'Failed to delete message' }, 500);
  }
});

// Thread endpoints (stub for Sprint 3)
messageRoutes.get('/:id/thread', async (c) => c.json({ message: 'Threads not implemented yet (Sprint 3)' }, 501));
messageRoutes.post('/:id/thread', async (c) => c.json({ message: 'Threads not implemented yet (Sprint 3)' }, 501));

// Reaction endpoints (stub for Sprint 3)
messageRoutes.post('/:id/reactions', async (c) => c.json({ message: 'Reactions not implemented yet (Sprint 3)' }, 501));
messageRoutes.delete('/:id/reactions/:emoji', async (c) => c.json({ message: 'Reactions not implemented yet (Sprint 3)' }, 501));
