import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handler } from './build/handler.js';

/**
 * Start the server with WebSocket support
 */
async function start() {
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';
  
  // Create HTTP server with SvelteKit handler
  const server = createServer((req, res) => {
    handler(req, res, (err) => {
      if (err) {
        console.error('SvelteKit handler error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
  });
  
  // Attach WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws, request) => {
    // Get WebSocket handler from globals
    const wsHandler = globalThis.__wsHandler;
    
    if (wsHandler) {
      wsHandler.handleConnection(ws, request);
    } else {
      console.error('WebSocket handler not initialized yet');
      // Close with a delay to allow initialization
      setTimeout(() => {
        const wsHandler = globalThis.__wsHandler;
        if (wsHandler) {
          wsHandler.handleConnection(ws, request);
        } else {
          console.error('WebSocket handler still not available');
          ws.close();
        }
      }, 1000);
    }
  });
  
  // Start listening
  server.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
    console.log(`WebSocket server: ws://${host}:${port}/ws`);
  });
}

// Start the server
start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
