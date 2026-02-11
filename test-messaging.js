#!/usr/bin/env node

/**
 * Relay Chat - Messaging Verification Test
 * Tests: signup, send message, fetch messages
 */

const API_URL = process.argv[2] || 'http://localhost:4002';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHasUsers() {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/has-users`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.hasUsers;
  } catch (err) {
    throw new Error(`Failed to check if users exist: ${err.message}`);
  }
}

async function signup(username, password, displayName) {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`Signup failed: ${err.message}`);
  }
}

async function sendMessage(token, channelId, content) {
  try {
    const response = await fetch(`${API_URL}/api/v1/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`Send message failed: ${err.message}`);
  }
}

async function fetchMessages(token, channelId) {
  try {
    const response = await fetch(`${API_URL}/api/v1/channels/${channelId}/messages`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`Fetch messages failed: ${err.message}`);
  }
}

async function main() {
  log('\n🧪 Relay Chat - Messaging Verification Test', colors.blue);
  log(`   Target: ${API_URL}\n`, colors.blue);

  let testUser = null;
  let testMessage = null;

  try {
    // Step 1: Check if users exist
    info('Step 1: Checking if users exist...');
    const hasUsers = await checkHasUsers();
    
    if (hasUsers) {
      warning('Users already exist - skipping signup test');
      warning('Run "make dev-reset" or "make prod-reset" to test full flow');
      process.exit(0);
    } else {
      success('No users exist - can test signup');
    }

    // Step 2: Create admin account
    info('Step 2: Creating admin account...');
    const timestamp = Date.now() % 100000; // Use last 5 digits only
    testUser = await signup(
      `admin${timestamp}`,
      'testpassword123',
      'Test Admin'
    );
    success(`User created: ${testUser.user.username} (${testUser.user.displayName})`);
    success(`Token received: ${testUser.token.substring(0, 20)}...`);

    // Wait a bit for async operations to complete
    await sleep(2000);

    // Step 3: Send a message
    info('Step 3: Sending test message to #general...');
    testMessage = await sendMessage(
      testUser.token,
      'general',
      `Test message sent at ${new Date().toISOString()}`
    );
    success(`Message sent: ${testMessage.id}`);
    success(`Content: "${testMessage.content}"`);

    // Wait a bit for message to propagate
    await sleep(1000);

    // Step 4: Fetch messages
    info('Step 4: Fetching messages from #general...');
    const messages = await fetchMessages(testUser.token, 'general');
    success(`Fetched ${messages.length} message(s)`);

    // Step 5: Verify our message is in the list
    info('Step 5: Verifying message was saved...');
    const foundMessage = messages.find(m => m.id === testMessage.id);
    
    if (foundMessage) {
      success('Message found in channel!');
      success(`Author: ${foundMessage.author.displayName}`);
      success(`Content: "${foundMessage.content}"`);
    } else {
      throw new Error('Message not found in fetched messages');
    }

    // All tests passed!
    log('\n🎉 All tests passed!', colors.green);
    log('   ✅ User signup', colors.green);
    log('   ✅ Message sending', colors.green);
    log('   ✅ Message fetching', colors.green);
    log('   ✅ Message verification\n', colors.green);

  } catch (err) {
    error(`\nTest failed: ${err.message}\n`);
    process.exit(1);
  }
}

main();
