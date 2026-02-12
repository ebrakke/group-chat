import { json, type RequestEvent } from '@sveltejs/kit';
import {
  verifyCredentials,
  createSession,
} from '$lib/server/lib/users.js';

/**
 * POST /api/v1/auth/login
 * Login with username and password
 */
export async function POST({ request }: RequestEvent) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return json({ error: 'Missing username or password' }, { status: 400 });
    }

    const user = await verifyCredentials(username, password);

    if (!user) {
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const session = createSession(user.id);

    return json({
      token: session.token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return json({ error: err.message || 'Login failed' }, { status: 500 });
  }
}
