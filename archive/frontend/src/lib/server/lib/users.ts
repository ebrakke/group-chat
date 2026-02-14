import { getDb } from '$lib/server/db/schema.js';
import bcrypt from 'bcrypt';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { encrypt, decrypt, generateToken } from './crypto.js';

const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 30;
const KEY_ENCRYPTION_SECRET = process.env.KEY_ENCRYPTION_SECRET || 'default-insecure-key-change-me';

export interface User {
  id: string;
  username: string;
  displayName: string;
  nostrPubkey: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

/**
 * Check if there are any users in the system
 */
export function hasUsers(): boolean {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count > 0;
}

/**
 * Create a new user
 */
export async function createUser(
  username: string,
  password: string,
  displayName: string,
  role: 'admin' | 'member' = 'member'
): Promise<User> {
  const db = getDb();
  
  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    throw new Error('Username already taken');
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  // Generate Nostr keypair
  const privateKey = generateSecretKey();
  const publicKey = getPublicKey(privateKey);
  
  // Encrypt private key
  const privateKeyHex = Buffer.from(privateKey).toString('hex');
  const encryptedPrivkey = encrypt(privateKeyHex, KEY_ENCRYPTION_SECRET);
  
  // Insert user
  const userId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, nostr_pubkey, nostr_privkey_encrypted, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, username, passwordHash, displayName, publicKey, encryptedPrivkey, role);
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    nostrPubkey: user.nostr_pubkey,
    role: user.role,
    createdAt: user.created_at,
  };
}

/**
 * Verify username and password
 */
export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  
  if (!user) {
    return null;
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return null;
  }
  
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    nostrPubkey: user.nostr_pubkey,
    role: user.role,
    createdAt: user.created_at,
  };
}

/**
 * Create a session for a user
 */
export function createSession(userId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  const sessionId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, token, expiresAt);
  
  return { token, expiresAt };
}

/**
 * Get user by session token
 */
export function getUserByToken(token: string): User | null {
  const db = getDb();
  const session = db.prepare(`
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as any;
  
  if (!session) {
    return null;
  }
  
  return {
    id: session.id,
    username: session.username,
    displayName: session.display_name,
    nostrPubkey: session.nostr_pubkey,
    role: session.role,
    createdAt: session.created_at,
  };
}

/**
 * Invalidate a session
 */
export function deleteSession(token: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Get user's decrypted Nostr private key
 */
export function getUserNostrPrivkey(userId: string): Uint8Array {
  const db = getDb();
  const user = db.prepare('SELECT nostr_privkey_encrypted FROM users WHERE id = ?').get(userId) as any;
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const decrypted = decrypt(user.nostr_privkey_encrypted, KEY_ENCRYPTION_SECRET);
  return Uint8Array.from(Buffer.from(decrypted, 'hex'));
}
