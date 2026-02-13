import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getUserByToken, type User } from '$lib/server/lib/users';
import { listChannels } from '$lib/server/lib/channels';

export const load: LayoutServerLoad = async ({ cookies, url, request }) => {
  // Check for token in cookies first, then Authorization header
  let token = cookies.get('token');
  
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  
  // Public routes (no auth required)
  const publicRoutes = ['/login', '/signup', '/invite'];
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));
  
  if (!token) {
    if (!isPublicRoute) {
      throw redirect(303, '/login');
    }
    return { user: null, token: null, channels: [] };
  }
  
  // Validate token and get user
  const user = getUserByToken(token) as User | null;
  
  if (!user) {
    cookies.delete('token', { path: '/' });
    if (!isPublicRoute) {
      throw redirect(303, '/login');
    }
    return { user: null, token: null, channels: [] };
  }
  
  // Load channels for sidebar
  const channels = listChannels();
  
  return {
    user,
    token,
    channels,
  };
};
