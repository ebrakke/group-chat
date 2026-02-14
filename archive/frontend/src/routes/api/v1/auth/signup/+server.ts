import { json, type RequestEvent } from '@sveltejs/kit';
import {
  hasUsers,
  createUser,
  createSession,
} from '$lib/server/lib/users.js';
import { validateInvite, useInvite } from '$lib/server/lib/invites.js';
import { getNostrClient } from '$lib/server/globals.js';

/**
 * POST /api/v1/auth/signup
 * Create a new account
 */
export async function POST({ request }: RequestEvent) {
  try {
    const body = await request.json();
    const { username, password, displayName, inviteCode } = body;

    // Validate required fields
    if (!username || !password || !displayName) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      return json({ error: 'Username must be 3-20 characters, alphanumeric, dashes, or underscores' }, { status: 400 });
    }

    // Check if this is the first user
    const isFirstUser = !hasUsers();

    // If invite-only mode is enabled, require/validate invite codes for non-first users
    const invitesRequired = process.env.REQUIRE_INVITE_CODE === 'true';
    if (!isFirstUser && invitesRequired) {
      if (!inviteCode) {
        return json({ error: 'Invite code required' }, { status: 400 });
      }

      if (!validateInvite(inviteCode)) {
        return json({ error: 'Invalid or expired invite code' }, { status: 400 });
      }
    }

    // Create user (first user becomes admin)
    const role = isFirstUser ? 'admin' : 'member';
    const user = await createUser(username, password, displayName, role);

    // Increment invite use count only when invite-only mode is enabled
    if (!isFirstUser && invitesRequired && inviteCode) {
      useInvite(inviteCode);
    }

    // Add the new user to the #general channel
    try {
      const nostrClient = getNostrClient();
      if (nostrClient && nostrClient.isConnected()) {
        const serverPrivkeyHex = process.env.SERVER_PRIVKEY;
        if (!serverPrivkeyHex) {
          console.error('Cannot add user to group: SERVER_PRIVKEY not set');
        } else {
          const serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
          const userPubkey = user.nostrPubkey;
          
          // Add user to #general group with 'member' role
          // (admins get both 'admin' and 'member' roles)
          const roles = isFirstUser ? ['admin', 'member'] : ['member'];
          await nostrClient.addUserToGroup('general', userPubkey, roles, serverPrivkey);
          console.log(`✅ Added user ${user.username} to #general channel`);
        }
      } else {
        console.warn('⚠️  Relay not connected, cannot add user to #general');
      }
    } catch (err) {
      console.error('❌ Failed to add user to #general:', err);
      // Don't fail signup if group membership fails
    }

    // Create session
    const session = createSession(user.id);

    // Set token in cookie for server-side auth
    const headers = new Headers();
    headers.append('Set-Cookie', `token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

    return json({
      token: session.token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nostrPubkey: user.nostrPubkey,
        role: user.role,
      },
    }, { status: 201, headers });
  } catch (err: any) {
    console.error('Signup error:', err);
    return json({ error: err.message || 'Signup failed' }, { status: 500 });
  }
}
