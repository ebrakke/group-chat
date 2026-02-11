import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  validateInvite,
  getInvite,
  createInvite,
  listInvites,
  deleteInvite,
} from '../lib/invites.js';

export const inviteRoutes = new Hono();

/**
 * GET /invite/:code
 * Validate an invite code (public endpoint)
 */
inviteRoutes.get('/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const valid = validateInvite(code);

    if (!valid) {
      return c.json({ valid: false, error: 'Invalid or expired invite code' }, 404);
    }

    return c.json({
      valid: true,
      workspaceName: 'Relay Chat', // TODO: Make this configurable
    });
  } catch (err: any) {
    console.error('Invite validation error:', err);
    return c.json({ error: err.message || 'Failed to validate invite' }, 500);
  }
});

/**
 * POST /invites
 * Create a new invite link
 */
inviteRoutes.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const maxUses = body.maxUses || null;

    const invite = createInvite(user.id, maxUses);

    // Generate full invite URL
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const url = `${baseUrl}/invite/${invite.code}`;

    return c.json({
      code: invite.code,
      url,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      createdAt: invite.createdAt,
    }, 201);
  } catch (err: any) {
    console.error('Invite creation error:', err);
    return c.json({ error: err.message || 'Failed to create invite' }, 500);
  }
});

/**
 * GET /invites
 * List all invites (admin only)
 */
inviteRoutes.get('/', authMiddleware, adminMiddleware, async (c) => {
  try {
    const invites = listInvites();

    return c.json(
      invites.map(inv => ({
        id: inv.id,
        code: inv.code,
        createdBy: inv.createdBy,
        createdAt: inv.createdAt,
        maxUses: inv.maxUses,
        useCount: inv.useCount,
      }))
    );
  } catch (err: any) {
    console.error('Invite list error:', err);
    return c.json({ error: err.message || 'Failed to list invites' }, 500);
  }
});

/**
 * DELETE /invites/:code
 * Revoke an invite (admin only)
 */
inviteRoutes.delete('/:code', authMiddleware, adminMiddleware, async (c) => {
  try {
    const code = c.req.param('code');

    deleteInvite(code);

    return c.json({ message: 'Invite revoked successfully' });
  } catch (err: any) {
    console.error('Invite deletion error:', err);
    return c.json({ error: err.message || 'Failed to revoke invite' }, 500);
  }
});
