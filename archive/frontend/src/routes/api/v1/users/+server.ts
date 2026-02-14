import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate } from '$lib/server/auth-helper.js';
import { getDb } from '$lib/server/db/schema.js';

/**
 * GET /api/v1/users
 * List all users
 */
export async function GET({ request }: RequestEvent) {
  const { error } = authenticate(request);
  if (error) return error;

  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, display_name, nostr_pubkey, role FROM users').all();

    return json(users.map((u: any) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      nostrPubkey: u.nostr_pubkey,
      role: u.role,
    })));
  } catch (err: any) {
    console.error('Users list error:', err);
    return json({ error: err.message || 'Failed to list users' }, { status: 500 });
  }
}
