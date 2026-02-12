import { Context, Next } from 'hono';
import { getUserByToken, User } from '$lib/server/lib/users.js';

// Extend Hono context to include user
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  const user = getUserByToken(token);
  
  if (!user) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }
  
  // Attach user to context
  c.set('user', user);
  
  await next();
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user');
  
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }
  
  await next();
}
