import { getDb } from '$lib/server/db/schema.js';
import { getNostrClient } from '$lib/server/globals.js';

export interface Message {
  id: string;
  channelId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    nostrPubkey: string;
  };
  content: string;
  attachments: any[];
  reactions: Record<string, string[]>;
  threadCount: number;
  createdAt: string;
  editedAt: string | null;
}

/**
 * Get messages for a channel
 */
export async function getMessages(channelId: string, limit: number = 50, before?: string): Promise<Message[]> {
  const nostrClient = getNostrClient();
  if (!nostrClient || !nostrClient.isConnected()) {
    console.error('Relay not connected');
    return [];
  }

  try {
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
    }).filter(m => m !== null) as Message[];

    return messages;
  } catch (err: any) {
    console.error('Failed to get messages:', err);
    return [];
  }
}

/**
 * Get a single message by ID
 */
export async function getMessage(messageId: string): Promise<Message | null> {
  const nostrClient = getNostrClient();
  if (!nostrClient || !nostrClient.isConnected()) {
    console.error('Relay not connected');
    return null;
  }

  try {
    const filter = {
      ids: [messageId],
      kinds: [9],
    };

    const events = await nostrClient.queryEvents([filter]);
    if (events.length === 0) {
      return null;
    }

    const event = events[0];
    const db = getDb();
    const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
      .get(event.pubkey) as any;

    if (!author) {
      return null;
    }

    const channelTag = event.tags.find(tag => tag[0] === 'h');
    const channelId = channelTag ? channelTag[1] : '';

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
  } catch (err: any) {
    console.error('Failed to get message:', err);
    return null;
  }
}

/**
 * Get thread replies for a message
 */
export async function getThreadReplies(parentId: string): Promise<Message[]> {
  const nostrClient = getNostrClient();
  if (!nostrClient || !nostrClient.isConnected()) {
    console.error('Relay not connected');
    return [];
  }

  try {
    // Query thread replies
    const filter = {
      kinds: [9],
      '#e': [parentId], // Replies reference parent with 'e' tag
    };

    const events = await nostrClient.queryEvents([filter]);

    // Get author info from database
    const db = getDb();
    const messages = events.map(event => {
      const author = db.prepare('SELECT id, username, display_name, nostr_pubkey FROM users WHERE nostr_pubkey = ?')
        .get(event.pubkey) as any;

      if (!author) {
        return null;
      }

      const channelTag = event.tags.find(tag => tag[0] === 'h');
      const channelId = channelTag ? channelTag[1] : '';

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
    }).filter(m => m !== null) as Message[];

    return messages;
  } catch (err: any) {
    console.error('Failed to get thread replies:', err);
    return [];
  }
}
