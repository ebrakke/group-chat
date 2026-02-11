import { getDb } from '../db/schema.js';

export interface Channel {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

/**
 * Check if a channel exists
 */
export function channelExists(channelId: string): boolean {
  const db = getDb();
  const result = db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId);
  return !!result;
}

/**
 * Create a channel record in the database
 */
export function createChannelRecord(id: string, name: string, description: string): Channel {
  const db = getDb();
  
  db.prepare(`
    INSERT INTO channels (id, name, description)
    VALUES (?, ?, ?)
  `).run(id, name, description);
  
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as any;
  
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    createdAt: channel.created_at,
  };
}

/**
 * Get all channels
 */
export function listChannels(): Channel[] {
  const db = getDb();
  const channels = db.prepare('SELECT * FROM channels ORDER BY created_at ASC').all() as any[];
  
  return channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    description: ch.description,
    createdAt: ch.created_at,
  }));
}

/**
 * Get a single channel
 */
export function getChannel(id: string): Channel | null {
  const db = getDb();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as any;
  
  if (!channel) {
    return null;
  }
  
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    createdAt: channel.created_at,
  };
}

/**
 * Update a channel
 */
export function updateChannel(id: string, name: string, description: string): Channel {
  const db = getDb();
  
  db.prepare(`
    UPDATE channels SET name = ?, description = ? WHERE id = ?
  `).run(name, description, id);
  
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as any;
  
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    createdAt: channel.created_at,
  };
}

/**
 * Delete a channel
 */
export function deleteChannel(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}
