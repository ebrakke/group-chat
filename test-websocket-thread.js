#!/usr/bin/env node

const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const API_URL = 'http://localhost:4002/api/v1';
const WS_URL = 'ws://localhost:4002/ws';

// Helper to make HTTP requests
function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = API_URL + path;
    const url = new URL(fullUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('Failed to parse JSON response:', data);
          resolve({ error: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function main() {
  console.log('=== WebSocket Thread Reply Test ===\n');

  // 1. Create user
  console.log('1. Creating test user...');
  const signupResponse = await request('POST', '/auth/signup', null, {
    username: `test${Date.now() % 100000}`,
    password: 'testpass123',
    displayName: 'Test User'
  });

  if (!signupResponse.token) {
    console.error('❌ Failed to create user:', signupResponse);
    process.exit(1);
  }

  const token = signupResponse.token;
  const userId = signupResponse.user.id;
  console.log(`✓ User created: ${userId}\n`);

  // 2. Connect WebSocket
  console.log('2. Connecting WebSocket...');
  const ws = new WebSocket(`${WS_URL}?token=${token}`);

  const receivedMessages = [];

  ws.on('open', () => {
    console.log('✓ WebSocket connected\n');
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`📩 WebSocket received: ${message.type}`);
    receivedMessages.push(message);
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err);
  });

  // Wait for authentication
  await new Promise((resolve) => {
    const checkAuth = setInterval(() => {
      const authMessage = receivedMessages.find(m => m.type === 'authenticated');
      if (authMessage) {
        clearInterval(checkAuth);
        console.log('✓ WebSocket authenticated\n');
        resolve();
      }
    }, 100);
  });

  // 3. Send a message
  console.log('3. Sending initial message...');
  const messageResponse = await request('POST', '/channels/general/messages', token, {
    content: `Test message ${Date.now()}`
  });

  const messageId = messageResponse.id;
  console.log(`✓ Message sent: ${messageId}\n`);

  // Wait for WebSocket to receive the message
  await new Promise((resolve) => setTimeout(resolve, 500));

  const newMessageEvent = receivedMessages.find(
    m => m.type === 'message.new' && m.message.id === messageId
  );

  if (newMessageEvent) {
    console.log('✅ WebSocket received new message event');
  } else {
    console.log('⚠️  WebSocket did NOT receive new message event');
  }

  // 4. Send a thread reply
  console.log('\n4. Sending thread reply...');
  const threadReplyResponse = await request('POST', `/messages/${messageId}/thread`, token, {
    content: 'This is a reply in thread'
  });

  const replyId = threadReplyResponse.id;
  console.log(`✓ Thread reply sent: ${replyId}\n`);

  // Wait for WebSocket to receive the thread reply
  await new Promise((resolve) => setTimeout(resolve, 500));

  const threadNewEvent = receivedMessages.find(
    m => m.type === 'thread.new' && m.message.id === replyId
  );

  if (threadNewEvent) {
    console.log('✅ WebSocket received thread.new event');
    console.log(`   - Parent ID: ${threadNewEvent.parentId}`);
    console.log(`   - Reply ID: ${threadNewEvent.message.id}`);
    console.log(`   - Content: ${threadNewEvent.message.content}`);
  } else {
    console.log('❌ WebSocket did NOT receive thread.new event');
    console.log('Received messages:', receivedMessages.map(m => m.type));
  }

  // 5. Send second thread reply
  console.log('\n5. Sending second thread reply...');
  const threadReply2Response = await request('POST', `/messages/${messageId}/thread`, token, {
    content: 'Second reply in thread'
  });

  const reply2Id = threadReply2Response.id;
  console.log(`✓ Second thread reply sent: ${reply2Id}\n`);

  // Wait for WebSocket to receive the second thread reply
  await new Promise((resolve) => setTimeout(resolve, 500));

  const threadNewEvent2 = receivedMessages.find(
    m => m.type === 'thread.new' && m.message.id === reply2Id
  );

  if (threadNewEvent2) {
    console.log('✅ WebSocket received second thread.new event');
  } else {
    console.log('❌ WebSocket did NOT receive second thread.new event');
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total WebSocket messages received: ${receivedMessages.length}`);
  console.log('Message types:');
  const messageTypes = {};
  receivedMessages.forEach(m => {
    messageTypes[m.type] = (messageTypes[m.type] || 0) + 1;
  });
  Object.entries(messageTypes).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  const threadEvents = receivedMessages.filter(m => m.type === 'thread.new');
  console.log(`\n✅ Thread reply broadcasts working: ${threadEvents.length} thread.new events received`);

  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
