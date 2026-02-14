import { json, type RequestEvent } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/lib/users.js';
import { authenticate } from '$lib/server/auth-helper.js';

/**
 * POST /api/v1/auth/logout
 * Invalidate current session
 */
export async function POST({ request }: RequestEvent) {
  try {
    const { error } = authenticate(request);
    if (error) return error;
    
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.slice(7); // Remove 'Bearer ' prefix

    if (token) {
      deleteSession(token);
    }

    return json({ message: 'Logged out successfully' });
  } catch (err: any) {
    console.error('Logout error:', err);
    return json({ error: err.message || 'Logout failed' }, { status: 500 });
  }
}
