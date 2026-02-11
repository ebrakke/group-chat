import { Context, Next } from 'hono';

export async function authMiddleware(c: Context, next: Next) {
  // TODO: Validate Bearer token from Authorization header
  // Check sessions table, verify not expired, attach user to context
  await next();
}
