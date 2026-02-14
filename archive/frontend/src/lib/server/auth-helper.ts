import { json } from '@sveltejs/kit';
import { getUserByToken, type User } from './lib/users.js';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Authenticate request and return user
 * Returns error response if authentication fails
 */
export function authenticate(request: Request): { user?: User; error?: Response } {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  const user = getUserByToken(token);
  
  if (!user) {
    return { error: json({ error: 'Invalid or expired session' }, { status: 401 }) };
  }
  
  return { user };
}

/**
 * Check if user is admin
 */
export function requireAdmin(user: User): Response | null {
  if (user.role !== 'admin') {
    return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }
  return null;
}
