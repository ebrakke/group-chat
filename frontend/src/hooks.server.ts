import type { Handle } from '@sveltejs/kit';

const API_URL = process.env.API_URL || 'http://api:4000';

export const handle: Handle = async ({ event, resolve }) => {
  const { url, request } = event;

  // Proxy API requests
  if (url.pathname.startsWith('/api/')) {
    const targetUrl = `${API_URL}${url.pathname}${url.search}`;
    
    // Forward all headers except host
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
    });
    
    try {
      const response = await fetch(proxyRequest);
      
      // Create response with appropriate headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('connection');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error('API proxy error:', error);
      return new Response(JSON.stringify({ error: 'API proxy error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // For WebSocket upgrade requests on /ws path
  if (url.pathname === '/ws') {
    // SvelteKit doesn't handle WebSocket upgrades in hooks, 
    // but we need to handle this at the reverse proxy level (nginx/caddy)
    // or use a separate WebSocket endpoint
    // For now, return an error to guide proper configuration
    return new Response('WebSocket upgrade must be handled by reverse proxy', {
      status: 426,
      headers: { 'Upgrade': 'WebSocket' },
    });
  }

  // Continue with normal SvelteKit rendering
  return resolve(event);
};
