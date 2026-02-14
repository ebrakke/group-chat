import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate } from '$lib/server/auth-helper.js';
import { getUserNostrPrivkey } from '$lib/server/lib/users.js';
import { getNostrClient, getWebSocketHandler } from '$lib/server/globals.js';
import { getDb } from '$lib/server/db/schema.js';

/**
 * GET /api/v1/channels/:channelId/messages
 * Get messages for a channel
 */
export async function GET({ params, url, request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;

  try {
    const channelId = params.channelId!;
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const before = url.searchParams.get('before');

    const nostrClient = getNostrClient();
    if (!nostrClient || !nostrClient.isConnected()) {
      return json({ error: 'Relay not connected' }, { status: 503 });
    }

    // Query messages from relay
    const filter: any = {
      kinds: [9], // NIP-29 messages
      '#h': [channelId],
      limit,
    };

    if (before) {
      filter.until = parseInt(before);
    }

    const events = await nostrClient.queryEvents([filter]);

    // Get author info from database
    const db = getDb();
    const messages = events.map(event => {
      const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
        .get(event.pubkey) as any;

      if (!author) {
        return null;
      }

      // Parse attachments
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

      return {
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
      };
    }).filter(m => m !== null);

    return json(messages);
  } catch (err: any) {
    console.error('Messages get error:', err);
    return json({ error: err.message || 'Failed to get messages' }, { status: 500 });
  }
}

/**
 * POST /api/v1/channels/:channelId/messages
 * Send a message to a channel
 */
export async function POST({ params, request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;

  try {
    const channelId = params.channelId!;
    const body = await request.json();
    const { content, attachments } = body;

    if (!content || content.trim().length === 0) {
      return json({ error: 'Message content required' }, { status: 400 });
    }

    const nostrClient = getNostrClient();
    if (!nostrClient || !nostrClient.isConnected()) {
      return json({ error: 'Relay not connected' }, { status: 503 });
    }

    // Get user's private key
    const privkey = getUserNostrPrivkey(user!.id);

    // Publish message
    const event = await nostrClient.publishMessage(channelId, content, privkey, attachments || []);

    const message = {
      id: event.id,
      channelId,
      author: {
        id: user!.id,
        username: user!.username,
        displayName: user!.displayName,
        nostrPubkey: user!.nostrPubkey,
      },
      content: event.content,
      attachments: attachments || [],
      reactions: {},
      threadCount: 0,
      createdAt: new Date(event.created_at * 1000).toISOString(),
      editedAt: null,
    };

    return json(message, { status: 201 });
  } catch (err: any) {
    console.error('Message send error:', err);
    return json({ error: err.message || 'Failed to send message' }, { status: 500 });
  }
}
