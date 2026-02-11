import { Hono } from 'hono';
import {
  hasUsers,
  createUser,
  verifyCredentials,
  createSession,
  deleteSession,
  getUserNostrPrivkey,
} from '../lib/users.js';
import { validateInvite, useInvite } from '../lib/invites.js';
import { authMiddleware } from '../middleware/auth.js';
import { getNostrClient } from '../index.js';

export const authRoutes = new Hono();

/**
 * POST /auth/signup
 * Create a new account
 */
authRoutes.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, displayName, inviteCode } = body;

    // Validate required fields
    if (!username || !password || !displayName) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      return c.json({ error: 'Username must be 3-20 characters, alphanumeric, dashes, or underscores' }, 400);
    }

    // Check if this is the first user
    const isFirstUser = !hasUsers();

    // If not first user, validate invite code
    if (!isFirstUser) {
      if (!inviteCode) {
        return c.json({ error: 'Invite code required' }, 400);
      }

      if (!validateInvite(inviteCode)) {
        return c.json({ error: 'Invalid or expired invite code' }, 400);
      }
    }

    // Create user (first user becomes admin)
    const role = isFirstUser ? 'admin' : 'member';
    const user = await createUser(username, password, displayName, role);

    // Increment invite use count if not first user
    if (!isFirstUser && inviteCode) {
      useInvite(inviteCode);
    }

    // Note: We don't publish kind 0 (profile) events to the NIP-29 relay.
    // NIP-29 relays only accept group-scoped events with an 'h' tag.
    // User profiles in group chats are handled through group membership metadata.

    // Create session
    const session = createSession(user.id);

    return c.json({
      token: session.token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
        role: user.role,
      },
    }, 201);
  } catch (err: any) {
    console.error('Signup error:', err);
    return c.json({ error: err.message || 'Signup failed' }, 500);
  }
});

/**
 * POST /auth/login
 * Login with username and password
 */
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: 'Missing username or password' }, 400);
    }

    const user = await verifyCredentials(username, password);

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const session = createSession(user.id);

    return c.json({
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
    return c.json({ error: err.message || 'Login failed' }, 500);
  }
});

/**
 * POST /auth/logout
 * Invalidate current session
 */
authRoutes.post('/logout', authMiddleware, async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.slice(7); // Remove 'Bearer ' prefix

    if (token) {
      deleteSession(token);
    }

    return c.json({ message: 'Logged out successfully' });
  } catch (err: any) {
    console.error('Logout error:', err);
    return c.json({ error: err.message || 'Logout failed' }, 500);
  }
});

/**
 * GET /auth/me
 * Get current authenticated user
 */
authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  return c.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    nostrPubkey: user.nostrPubkey,
    role: user.role,
  });
});
