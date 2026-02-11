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

/**
 * GET /messages/:id/thread
 * Get thread replies for a message
 */
messageRoutes.get('/:id/thread', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Get the parent message
    const parentEvents = await nostrClient.queryEvents([{ ids: [messageId] }]);
    if (parentEvents.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const parentEvent = parentEvents[0];
    const db = getDb();

    // Get author info for parent
    const parentAuthor = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
      .get(parentEvent.pubkey) as any;

    if (!parentAuthor) {
      return c.json({ error: 'Parent message author not found' }, 404);
    }

    // Get channel ID from 'h' tag
    const channelTag = parentEvent.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return c.json({ error: 'Invalid message: no channel tag' }, 400);
    }
    const channelId = channelTag[1];

    // Parse parent message
    const parentAttachments = parentEvent.tags
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

    const parentMessage = {
      id: parentEvent.id,
      channelId,
      author: {
        id: parentAuthor.id,
        username: parentAuthor.username,
        displayName: parentAuthor.display_name,
        nostrPubkey: parentAuthor.nostr_pubkey,
      },
      content: parentEvent.content,
      attachments: parentAttachments,
      reactions: {},
      threadCount: 0,
      createdAt: new Date(parentEvent.created_at * 1000).toISOString(),
      editedAt: null,
    };

    // Get thread replies
    const replyEvents = await nostrClient.getThreadReplies(messageId);

    // Map replies to message format
    const replies = [];
    for (const event of replyEvents) {
      const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
        .get(event.pubkey) as any;

      if (!author) continue;

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

      replies.push({
        id: event.id,
        channelId,
        author: {
          id: author.id,
          username: author.username,
          displayName: author.display_name,
          nostrPubkey: author.nostr_pubkey,
        },
        content: event.content,
        attachments,
        reactions: {},
        threadCount: 0,
        createdAt: new Date(event.created_at * 1000).toISOString(),
        editedAt: null,
      });
    }

    return c.json({
      root: parentMessage,
      replies,
    });
  } catch (err: any) {
    console.error('Thread fetch error:', err);
    return c.json({ error: err.message || 'Failed to fetch thread' }, 500);
  }
});

/**
 * POST /messages/:id/thread
 * Reply in a thread
 */
messageRoutes.post('/:id/thread', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');
    const body = await c.req.json();
    const { content, alsoSendToChannel, attachments } = body;

    if (!content || content.trim().length === 0) {
      return c.json({ error: 'Reply content required' }, 400);
    }

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Get the parent message
    const parentEvents = await nostrClient.queryEvents([{ ids: [messageId] }]);
    if (parentEvents.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const parentEvent = parentEvents[0];
    const user = c.get('user');

    // Get channel ID from 'h' tag
    const channelTag = parentEvent.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return c.json({ error: 'Invalid message: no channel tag' }, 400);
    }
    const channelId = channelTag[1];

    // Get user's private key
    const privkey = getUserNostrPrivkey(user.id);

    // Check if this is the first reply (need to create thread root)
    const existingReplies = await nostrClient.getThreadReplies(messageId);
    let threadEvent;

    if (existingReplies.length === 0) {
      // Create thread root (kind 11)
      threadEvent = await nostrClient.createThreadRoot(
        channelId,
        messageId,
        content,
        privkey,
        attachments
      );
    } else {
      // Add reply to existing thread (kind 1111)
      // Find the most recent reply to use as parent
      const lastReply = existingReplies[existingReplies.length - 1];
      threadEvent = await nostrClient.replyInThread(
        channelId,
        messageId,
        lastReply.id,
        content,
        privkey,
        attachments
      );
    }

    // If alsoSendToChannel is true, also publish a kind 9 message
    if (alsoSendToChannel) {
      const channelContent = `${content}\n\n_Reply to thread: ${messageId}_`;
      await nostrClient.publishMessage(channelId, channelContent, privkey, attachments);
    }

    return c.json({
      id: threadEvent.id,
      channelId,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
      },
      content: threadEvent.content,
      attachments: attachments || [],
      reactions: {},
      threadCount: 0,
      createdAt: new Date(threadEvent.created_at * 1000).toISOString(),
      editedAt: null,
    });
  } catch (err: any) {
    console.error('Thread reply error:', err);
    return c.json({ error: err.message || 'Failed to post reply' }, 500);
  }
});

/**
 * POST /messages/:id/reactions
 * Add a reaction to a message
 */
messageRoutes.post('/:id/reactions', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');
    const body = await c.req.json();
    const { emoji } = body;

    if (!emoji || emoji.trim().length === 0) {
      return c.json({ error: 'Emoji required' }, 400);
    }

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    // Get the message to verify it exists and get channel ID
    const events = await nostrClient.queryEvents([{ ids: [messageId] }]);
    if (events.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    const messageEvent = events[0];
    const channelTag = messageEvent.tags.find(tag => tag[0] === 'h');
    if (!channelTag) {
      return c.json({ error: 'Invalid message: no channel tag' }, 400);
    }
    const channelId = channelTag[1];

    const user = c.get('user');
    const privkey = getUserNostrPrivkey(user.id);

    // Check if user already reacted with this emoji
    const existingReaction = await nostrClient.findUserReaction(messageId, user.nostrPubkey, emoji);
    if (existingReaction) {
      return c.json({ error: 'Already reacted with this emoji' }, 400);
    }

    // Add reaction
    await nostrClient.addReaction(channelId, messageId, emoji, privkey);

    return c.json({ message: 'Reaction added successfully' });
  } catch (err: any) {
    console.error('Reaction add error:', err);
    return c.json({ error: err.message || 'Failed to add reaction' }, 500);
  }
});

/**
 * DELETE /messages/:id/reactions/:emoji
 * Remove a reaction from a message
 */
messageRoutes.delete('/:id/reactions/:emoji', authMiddleware, async (c) => {
  try {
    const messageId = c.req.param('id');
    const emoji = decodeURIComponent(c.req.param('emoji'));

    const nostrClient = getNostrClient();
    if (!nostrClient.isConnected()) {
      return c.json({ error: 'Relay not connected' }, 503);
    }

    const user = c.get('user');

    // Find the user's reaction event
    const reactionEvent = await nostrClient.findUserReaction(messageId, user.nostrPubkey, emoji);
    if (!reactionEvent) {
      return c.json({ error: 'Reaction not found' }, 404);
    }

    // Delete the reaction
    const privkey = getUserNostrPrivkey(user.id);
    await nostrClient.removeReaction(reactionEvent.id, privkey);

    return c.json({ message: 'Reaction removed successfully' });
  } catch (err: any) {
    console.error('Reaction removal error:', err);
    return c.json({ error: err.message || 'Failed to remove reaction' }, 500);
  }
});
