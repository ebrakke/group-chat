import { json } from '@sveltejs/kit';
import { hasUsers } from '$lib/server/lib/users.js';

/**
 * GET /api/v1/auth/has-users
 * Check if any users exist (public endpoint for initial setup check)
 */
export async function GET() {
  return json({
    hasUsers: hasUsers(),
  });
}
