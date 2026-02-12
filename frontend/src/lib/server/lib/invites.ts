import { getDb } from '$lib/server/db/schema.js';
import { generateToken } from './crypto.js';

export interface Invite {
  id: string;
  code: string;
  createdBy: string;
  createdAt: string;
  maxUses: number | null;
  useCount: number;
}

/**
 * Create a new invite code
 */
export function createInvite(createdBy: string, maxUses: number | null = null): Invite {
  const db = getDb();
  const code = generateToken(16); // 32 char hex string
  const inviteId = crypto.randomUUID();
  
  db.prepare(`
    INSERT INTO invites (id, code, created_by, max_uses)
    VALUES (?, ?, ?, ?)
  `).run(inviteId, code, createdBy, maxUses);
  
  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(inviteId) as any;
  
  return {
    id: invite.id,
    code: invite.code,
    createdBy: invite.created_by,
    createdAt: invite.created_at,
    maxUses: invite.max_uses,
    useCount: invite.use_count,
  };
}

/**
 * Validate an invite code
 */
export function validateInvite(code: string): boolean {
  const db = getDb();
  const invite = db.prepare(`
    SELECT * FROM invites WHERE code = ?
  `).get(code) as any;
  
  if (!invite) {
    return false;
  }
  
  // Check if max uses exceeded
  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return false;
  }
  
  return true;
}

/**
 * Increment invite use count
 */
export function useInvite(code: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE invites SET use_count = use_count + 1 WHERE code = ?
  `).run(code);
}

/**
 * Get invite by code
 */
export function getInvite(code: string): Invite | null {
  const db = getDb();
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(code) as any;
  
  if (!invite) {
    return null;
  }
  
  return {
    id: invite.id,
    code: invite.code,
    createdBy: invite.created_by,
    createdAt: invite.created_at,
    maxUses: invite.max_uses,
    useCount: invite.use_count,
  };
}

/**
 * List all invites
 */
export function listInvites(): Invite[] {
  const db = getDb();
  const invites = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all() as any[];
  
  return invites.map(inv => ({
    id: inv.id,
    code: inv.code,
    createdBy: inv.created_by,
    createdAt: inv.created_at,
    maxUses: inv.max_uses,
    useCount: inv.use_count,
  }));
}

/**
 * Delete an invite
 */
export function deleteInvite(code: string): void {
  const db = getDb();
  db.prepare('DELETE FROM invites WHERE code = ?').run(code);
}
