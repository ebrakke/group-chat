#!/usr/bin/env node

const WebSocket = require('ws');

const API_URL = 'http://localhost:4002';
const WS_URL = 'ws://localhost:4002/ws';

let token = null;
let ws = null;
let messageId = null;

async function signup() {
  console.log('\n1. Signing up test user...');
  const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'testuser',
      password: 'testpassword',
      displayName: 'Test User'
    })
  });
  
  if (!response.ok) {
    // User might already exist, try logging in
    const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'testpassword'
      })
    });
    
    if (!loginRes.ok) {
      const error = await loginRes.text();
      throw new Error(`Failed to login: ${error}`);
    }
    
    const data = await loginRes.json();
    token = data.token;
    console.log('   ✓ Logged in');
  } else {
    const data = await response.json();
    token = data.token;
    console.log('   ✓ Signed up');
  }
}

async function connectWebSocket() {
  console.log('\n2. Connecting to WebSocket...');
  
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`${WS_URL}?token=${token}`);
    
    ws.on('open', () => {
      console.log('   ✓ WebSocket connected');
    });
    
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      console.log(`   📨 Received: ${event.type}`, event.parentId ? `(parent: ${event.parentId.substring(0, 8)}...)` : '');
      
      if (event.type === 'authenticated') {
        resolve();
      }
      
      if (event.type === 'thread.new') {
        console.log('   ✅ Thread reply received via WebSocket!');
        console.log(`      Parent ID: ${event.parentId}`);
        console.log(`      Message ID: ${event.message.id}`);
        console.log(`      Content: ${event.message.content}`);
        
        // Test passed!
        console.log('\n✅ SUCCESS: Thread reply was received immediately via WebSocket!');
        cleanup();
      }
    });
    
    ws.on('error', (err) => {
      console.error('   ❌ WebSocket error:', err);
      reject(err);
    });
  });
}

async function sendMessage() {
  console.log('\n3. Sending a test message...');
  
  const response = await fetch(`${API_URL}/api/v1/channels/general/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      content: 'Test message for thread testing'
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to send message');
  }
  
  const data = await response.json();
  messageId = data.id;
  console.log(`   ✓ Message sent (ID: ${messageId.substring(0, 8)}...)`);
  
  // Wait a moment for the message to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function replyInThread() {
  console.log('\n4. Replying in thread...');
  console.log('   ⏱️  Measuring WebSocket latency...');
  
  const startTime = Date.now();
  
  const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/thread`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      content: 'This is a thread reply!',
      alsoSendToChannel: false
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to reply in thread: ${error}`);
  }
  
  const data = await response.json();
  console.log(`   ✓ Thread reply sent (ID: ${data.id.substring(0, 8)}...)`);
  console.log(`   ⏱️  API response time: ${Date.now() - startTime}ms`);
  console.log('   ⏱️  Waiting for WebSocket event...');
}

function cleanup() {
  if (ws) {
    ws.close();
  }
  console.log('\n✓ Test completed successfully!\n');
  process.exit(0);
}

async function main() {
  try {
    console.log('=== Thread Reply WebSocket Test ===');
    
    await signup();
    await connectWebSocket();
    await sendMessage();
    await replyInThread();
    
    // Wait up to 10 seconds for the WebSocket event
    setTimeout(() => {
      console.log('\n❌ FAILED: WebSocket event not received within 10 seconds');
      cleanup();
      process.exit(1);
    }, 10000);
    
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    cleanup();
    process.exit(1);
  }
}

main();
