import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handler } from './build/handler.js';

// Import server initialization from hooks
// This ensures database and WebSocket handler are ready before accepting connections
import './build/server/index.js';

/**
 * Wait for the WebSocket handler to be initialized
 */
async function waitForInitialization(maxWaitMs = 10000) {
  const startTime = Date.now();
  while (!globalThis.__wsHandler) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error('WebSocket handler not initialized within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('WebSocket handler initialized and ready');
}

/**
 * Start the server with WebSocket support
 */
async function start() {
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';
  
  // Trigger initialization by importing the server bundle
  // The hooks.server.ts initialize() will run on first module load
  console.log('Waiting for server initialization...');
  
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
    const wsHandler = globalThis.__wsHandler;
    
    if (wsHandler) {
      wsHandler.handleConnection(ws, request);
    } else {
      console.error('WebSocket handler not available');
      ws.close(1011, 'Service unavailable');
    }
  });
  
  // Wait for initialization before listening
  try {
    await waitForInitialization();
  } catch (err) {
    console.error('Initialization failed:', err);
    // Continue anyway, but log the error
  }
  
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
