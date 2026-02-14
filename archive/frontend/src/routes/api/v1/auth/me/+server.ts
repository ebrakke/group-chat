import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate } from '$lib/server/auth-helper.js';

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 */
export async function GET({ request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;

  return json({
    id: user!.id,
    username: user!.username,
    displayName: user!.displayName,
    nostrPubkey: user!.nostrPubkey,
    role: user!.role,
  });
}
