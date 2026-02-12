#!/usr/bin/env node

// Test Bug 1: WebSocket not delivering events
const WebSocket = require('ws');

const API_URL = 'http://localhost:4002/api/v1';
const WS_URL = 'ws://localhost:4002/ws';

async function post(path, data, token) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

async function main() {
  console.log('=== Testing WebSocket Event Delivery ===\n');

  // Step 1: Login as existing user
  console.log('1. Logging in as test user...');
  const loginResp = await post('/auth/login', {
    username: 'testuser',
    password: 'testpass123'
  });
  
  if (!loginResp.token) {
    console.error('   ❌ Failed to login:', loginResp);
    process.exit(1);
  }
  
  const token = loginResp.token;
  console.log(`   ✓ Logged in, token: ${token.substring(0, 20)}...\n`);

  // Step 2: Connect to WebSocket
  console.log('2. Connecting to WebSocket...');
  const ws = new WebSocket(`${WS_URL}?token=${token}`);

  let authenticated = false;
  let messageReceived = false;
  let testComplete = false;

  ws.on('open', () => {
    console.log('   ✓ WebSocket connected\n');
  });

  ws.on('message', (data) => {
    const event = JSON.parse(data.toString());
    console.log(`   📨 Received WebSocket event:`, event);

    if (event.type === 'authenticated') {
      authenticated = true;
      console.log('   ✓ WebSocket authenticated\n');
      
      // Step 3: Post a message via REST after authenticated
      console.log('3. Posting message via REST API...');
      post('/channels/general/messages', {
        content: 'Test message to check WebSocket delivery'
      }, token).then(msg => {
        console.log(`   ✓ Message posted: ${msg.id}\n`);
        console.log('4. Waiting for WebSocket event...');
      }).catch(err => {
        console.error('   ❌ Failed to post message:', err);
        process.exit(1);
      });
    } else if (event.type === 'message.new') {
      messageReceived = true;
      console.log('   ✅ SUCCESS: Message received via WebSocket!');
      console.log(`   Content: "${event.message.content}"\n`);
      testComplete = true;
      ws.close();
    }
  });

  ws.on('error', (err) => {
    console.error('   ❌ WebSocket error:', err.message);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('   WebSocket closed\n');
    
    console.log('=== Test Summary ===');
    if (testComplete && messageReceived) {
      console.log('✅ BUG FIXED: WebSocket is delivering events correctly!');
      process.exit(0);
    } else if (authenticated && !messageReceived) {
      console.log('❌ BUG PRESENT: WebSocket connected and authenticated, but message not received!');
      console.log('   This indicates events are not being delivered through the WebSocket.');
      process.exit(1);
    } else {
      console.log('❌ TEST FAILED: Could not complete authentication');
      process.exit(1);
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    if (!messageReceived) {
      console.log('\n⏱️  TIMEOUT: No message received after 10 seconds');
      console.log('❌ BUG PRESENT: WebSocket events not being delivered!');
      ws.close();
      process.exit(1);
    }
  }, 10000);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
