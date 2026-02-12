import type { Handle } from '@sveltejs/kit';

// Fly.io uses .flycast internal DNS for service-to-service communication
const API_URL = process.env.API_URL || 'http://relay-chat-api.flycast:4000';

export const handle: Handle = async ({ event, resolve }) => {
  const { url, request } = event;

  // Proxy API requests to internal API service
  if (url.pathname.startsWith('/api/')) {
    const targetUrl = `${API_URL}${url.pathname}${url.search}`;
    
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.arrayBuffer() 
        : undefined,
    });
    
    try {
      const response = await fetch(proxyRequest);
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

  // Proxy WebSocket upgrade requests to API service
  if (url.pathname === '/ws') {
    const targetUrl = `${API_URL}/ws${url.search}`;
    
    // Forward WebSocket upgrade to API service
    const headers = new Headers(request.headers);
    headers.delete('host');
    
    const wsRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      duplex: 'half',
    });
    
    try {
      return await fetch(wsRequest);
    } catch (error) {
      console.error('WebSocket proxy error:', error);
      return new Response('WebSocket upgrade failed', {
        status: 502,
      });
    }
  }

  return resolve(event);
};
