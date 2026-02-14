import { json, type RequestEvent } from '@sveltejs/kit';
import { authenticate, requireAdmin } from '$lib/server/auth-helper.js';
import { listInvites, createInvite } from '$lib/server/lib/invites.js';

/**
 * GET /api/v1/invites
 * List all invite codes (admin only)
 */
export async function GET({ request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;
  
  const adminError = requireAdmin(user!);
  if (adminError) return adminError;

  try {
    const invites = listInvites();
    return json(invites);
  } catch (err: any) {
    console.error('Invites list error:', err);
    return json({ error: err.message || 'Failed to list invites' }, { status: 500 });
  }
}

/**
 * POST /api/v1/invites
 * Create a new invite code (admin only)
 */
export async function POST({ request }: RequestEvent) {
  const { user, error } = authenticate(request);
  if (error) return error;
  
  const adminError = requireAdmin(user!);
  if (adminError) return adminError;

  try {
    const body = await request.json();
    const { maxUses } = body;

    const invite = createInvite(user!.id, maxUses);
    return json(invite, { status: 201 });
  } catch (err: any) {
    console.error('Invite create error:', err);
    return json({ error: err.message || 'Failed to create invite' }, { status: 500 });
  }
}
