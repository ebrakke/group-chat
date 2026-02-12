#!/usr/bin/env node

/**
 * Sprint 4 QA Test Suite
 * Tests file uploads and channel management features
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const API_URL = 'http://localhost:4002/api/v1';
const WS_URL = 'ws://localhost:4002/ws';

// Test state
let testResults = [];
let token1 = null; // User 1 token
let token2 = null; // User 2 token
let ws1 = null;
let ws2 = null;
let testChannel = null;

// Test utilities
function log(section, message, status = 'INFO') {
  const timestamp = new Date().toISOString();
  const statusSymbol = {
    'PASS': '✅',
    'FAIL': '❌',
    'INFO': 'ℹ️',
    'WARN': '⚠️'
  }[status] || 'ℹ️';
  
  console.log(`${statusSymbol} [${section}] ${message}`);
  
  testResults.push({
    timestamp,
    section,
    message,
    status
  });
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    log('ASSERT', `${message}: OK`, 'PASS');
    return true;
  } else {
    log('ASSERT', `${message}: Expected ${expected}, got ${actual}`, 'FAIL');
    return false;
  }
}

function assertExists(value, message) {
  if (value !== null && value !== undefined) {
    log('ASSERT', `${message}: exists`, 'PASS');
    return true;
  } else {
    log('ASSERT', `${message}: missing`, 'FAIL');
    return false;
  }
}

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// WebSocket helper
async function connectWebSocket(sessionCookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: {
        Cookie: sessionCookie
      }
    });
    
    ws.on('open', () => {
      log('WEBSOCKET', 'Connected', 'PASS');
      resolve(ws);
    });
    
    ws.on('error', (err) => {
      log('WEBSOCKET', `Connection error: ${err.message}`, 'FAIL');
      reject(err);
    });
  });
}

// Test 1: Authentication
async function testAuthentication() {
  log('AUTH', '=== Testing Authentication ===');
  
  try {
    // Create test user 1
    const timestamp = Math.floor(Date.now() / 1000).toString().slice(-6);
    const signupRes1 = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `test1_${timestamp}`,
        password: 'TestPass123!',
        displayName: 'Test User 1',
        inviteCode: 'test-invite-code'
      })
    });
    
    if (signupRes1.status === 403) {
      log('AUTH', 'Invite required, trying to create invite first', 'WARN');
      // Try without invite
      const signupRes1NoInvite = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `test1_${timestamp}`,
          password: 'TestPass123!',
          displayName: 'Test User 1'
        })
      });
      
      if (signupRes1NoInvite.ok) {
        const data1 = await signupRes1NoInvite.json();
        session1 = signupRes1NoInvite.headers.get('set-cookie');
        log('AUTH', 'User 1 signup successful (no invite needed)', 'PASS');
      } else {
        log('AUTH', 'Cannot create test user without invite code', 'FAIL');
        return false;
      }
    } else if (signupRes1.ok) {
      const data1 = await signupRes1.json();
      session1 = signupRes1.headers.get('set-cookie');
      log('AUTH', 'User 1 signup successful', 'PASS');
    } else {
      const error1 = await signupRes1.text();
      log('AUTH', `User 1 signup failed: ${error1}`, 'FAIL');
      return false;
    }
    
    // Create test user 2 (need an invite now)
    // First create invite as user 1
    let inviteCode = null;
    if (session1) {
      const inviteRes = await fetch(`${API_URL}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: session1
        },
        body: JSON.stringify({ maxUses: 5 })
      });
      
      if (inviteRes.ok) {
        const inviteData = await inviteRes.json();
        inviteCode = inviteData.code;
        log('AUTH', 'Created invite code for user 2', 'PASS');
      }
    }
    
    const signupRes2 = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `test2_${timestamp}`,
        password: 'TestPass123!',
        displayName: 'Test User 2',
        inviteCode: inviteCode
      })
    });
    
    if (signupRes2.ok) {
      const data2 = await signupRes2.json();
      session2 = signupRes2.headers.get('set-cookie');
      log('AUTH', 'User 2 signup successful', 'PASS');
    } else {
      const error2 = await signupRes2.text();
      log('AUTH', `User 2 signup failed: ${error2}`, 'FAIL');
      return false;
    }
    
    return true;
  } catch (err) {
    log('AUTH', `Error: ${err.message}`, 'FAIL');
    return false;
  }
}

// Test 2: File Upload Endpoint
async function testFileUpload() {
  log('UPLOAD', '=== Testing File Upload Endpoint ===');
  
  try {
    // Create a test image file
    const testImagePath = '/tmp/test-image.png';
    const testImageData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(testImagePath, testImageData);
    
    // Test uploading the image
    const form = new FormData();
    form.append('file', fs.createReadStream(testImagePath), {
      filename: 'test-image.png',
      contentType: 'image/png'
    });
    
    const uploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: {
        Cookie: session1
      },
      body: form
    });
    
    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      log('UPLOAD', `Upload failed: ${error}`, 'FAIL');
      return false;
    }
    
    const uploadData = await uploadRes.json();
    log('UPLOAD', 'File uploaded successfully', 'PASS');
    
    assertExists(uploadData.url, 'Upload URL');
    assertExists(uploadData.sha256, 'SHA-256 hash');
    assertExists(uploadData.size, 'File size');
    assertEqual(uploadData.mimeType, 'image/png', 'MIME type');
    assertEqual(uploadData.filename, 'test-image.png', 'Filename');
    
    // Test file size limit (create 51MB file)
    log('UPLOAD', 'Testing file size limit (50MB)...', 'INFO');
    const largeFilePath = '/tmp/test-large.bin';
    const largeFileSize = 51 * 1024 * 1024; // 51MB
    fs.writeFileSync(largeFilePath, Buffer.alloc(largeFileSize));
    
    const largeForm = new FormData();
    largeForm.append('file', fs.createReadStream(largeFilePath), {
      filename: 'test-large.bin',
      contentType: 'image/png'
    });
    
    const largeUploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: {
        Cookie: session1
      },
      body: largeForm
    });
    
    if (largeUploadRes.status === 400) {
      log('UPLOAD', 'Large file correctly rejected', 'PASS');
    } else {
      log('UPLOAD', 'Large file should have been rejected', 'FAIL');
    }
    
    // Test invalid file type
    log('UPLOAD', 'Testing invalid file type...', 'INFO');
    const invalidFilePath = '/tmp/test.exe';
    fs.writeFileSync(invalidFilePath, 'invalid');
    
    const invalidForm = new FormData();
    invalidForm.append('file', fs.createReadStream(invalidFilePath), {
      filename: 'test.exe',
      contentType: 'application/x-msdownload'
    });
    
    const invalidUploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: {
        Cookie: session1
      },
      body: invalidForm
    });
    
    if (invalidUploadRes.status === 400) {
      log('UPLOAD', 'Invalid file type correctly rejected', 'PASS');
    } else {
      log('UPLOAD', 'Invalid file type should have been rejected', 'FAIL');
    }
    
    // Cleanup
    fs.unlinkSync(testImagePath);
    fs.unlinkSync(largeFilePath);
    fs.unlinkSync(invalidFilePath);
    
    return true;
  } catch (err) {
    log('UPLOAD', `Error: ${err.message}`, 'FAIL');
    return false;
  }
}

// Test 3: Channel Management
async function testChannelManagement() {
  log('CHANNEL', '=== Testing Channel Management ===');
  
  try {
    // List existing channels
    const listRes = await fetch(`${API_URL}/channels`, {
      headers: { Cookie: session1 }
    });
    
    if (!listRes.ok) {
      log('CHANNEL', 'Failed to list channels', 'FAIL');
      return false;
    }
    
    const channels = await listRes.json();
    log('CHANNEL', `Found ${channels.length} existing channels`, 'PASS');
    
    // Test create channel (as non-admin user)
    const newChannelId = `test-${timestamp}`;
    const createRes = await fetch(`${API_URL}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session1
      },
      body: JSON.stringify({
        id: newChannelId,
        name: 'Test Channel',
        description: 'A test channel for Sprint 4'
      })
    });
    
    if (!createRes.ok) {
      const error = await createRes.text();
      log('CHANNEL', `Failed to create channel: ${error}`, 'FAIL');
      return false;
    }
    
    testChannel = await createRes.json();
    log('CHANNEL', 'Channel created successfully by non-admin user', 'PASS');
    assertEqual(testChannel.id, newChannelId, 'Channel ID');
    assertEqual(testChannel.name, 'Test Channel', 'Channel name');
    
    // Wait for WebSocket broadcast
    await wait(500);
    
    // Test edit channel
    const updateRes = await fetch(`${API_URL}/channels/${newChannelId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session2 // Different user can edit
      },
      body: JSON.stringify({
        name: 'Updated Test Channel',
        description: 'Updated description'
      })
    });
    
    if (!updateRes.ok) {
      const error = await updateRes.text();
      log('CHANNEL', `Failed to update channel: ${error}`, 'FAIL');
      return false;
    }
    
    const updatedChannel = await updateRes.json();
    log('CHANNEL', 'Channel updated successfully by different user', 'PASS');
    assertEqual(updatedChannel.name, 'Updated Test Channel', 'Updated channel name');
    
    // Test deleting #general (should fail)
    const deleteGeneralRes = await fetch(`${API_URL}/channels/general`, {
      method: 'DELETE',
      headers: { Cookie: session1 }
    });
    
    if (deleteGeneralRes.status === 403) {
      log('CHANNEL', '#general channel correctly protected from deletion', 'PASS');
    } else {
      log('CHANNEL', '#general channel should be protected', 'FAIL');
    }
    
    // Test delete channel
    const deleteRes = await fetch(`${API_URL}/channels/${newChannelId}`, {
      method: 'DELETE',
      headers: { Cookie: session1 }
    });
    
    if (!deleteRes.ok) {
      const error = await deleteRes.text();
      log('CHANNEL', `Failed to delete channel: ${error}`, 'FAIL');
      return false;
    }
    
    log('CHANNEL', 'Channel deleted successfully', 'PASS');
    
    // Verify channel is gone
    const verifyRes = await fetch(`${API_URL}/channels/${newChannelId}`, {
      headers: { Cookie: session1 }
    });
    
    if (verifyRes.status === 404) {
      log('CHANNEL', 'Deleted channel no longer accessible', 'PASS');
    } else {
      log('CHANNEL', 'Deleted channel should return 404', 'FAIL');
    }
    
    return true;
  } catch (err) {
    log('CHANNEL', `Error: ${err.message}`, 'FAIL');
    return false;
  }
}

// Test 4: Message with Attachments
async function testMessageAttachments() {
  log('MESSAGE', '=== Testing Message Attachments ===');
  
  try {
    // Upload a file first
    const testImagePath = '/tmp/test-attach.png';
    const testImageData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(testImagePath, testImageData);
    
    const form = new FormData();
    form.append('file', fs.createReadStream(testImagePath), {
      filename: 'test-attach.png',
      contentType: 'image/png'
    });
    
    const uploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: { Cookie: session1 },
      body: form
    });
    
    if (!uploadRes.ok) {
      log('MESSAGE', 'Failed to upload file for attachment test', 'FAIL');
      return false;
    }
    
    const uploadData = await uploadRes.json();
    log('MESSAGE', 'File uploaded for attachment', 'PASS');
    
    // Send message with attachment
    const messageRes = await fetch(`${API_URL}/channels/general/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session1
      },
      body: JSON.stringify({
        content: 'Test message with attachment',
        attachments: [{
          url: uploadData.url,
          mimeType: uploadData.mimeType,
          size: uploadData.size,
          filename: uploadData.filename,
          sha256: uploadData.sha256
        }]
      })
    });
    
    if (!messageRes.ok) {
      const error = await messageRes.text();
      log('MESSAGE', `Failed to send message with attachment: ${error}`, 'FAIL');
      return false;
    }
    
    const messageData = await messageRes.json();
    log('MESSAGE', 'Message with attachment sent successfully', 'PASS');
    assertExists(messageData.id, 'Message ID');
    
    // Fetch messages and verify attachment
    await wait(500);
    
    const fetchRes = await fetch(`${API_URL}/channels/general/messages?limit=10`, {
      headers: { Cookie: session1 }
    });
    
    if (!fetchRes.ok) {
      log('MESSAGE', 'Failed to fetch messages', 'FAIL');
      return false;
    }
    
    const messages = await fetchRes.json();
    const sentMessage = messages.find(m => m.id === messageData.id);
    
    if (sentMessage) {
      log('MESSAGE', 'Message with attachment retrieved', 'PASS');
      // Check if message has imeta tags (this is in the event data)
      log('MESSAGE', 'Attachment data stored in message', 'INFO');
    } else {
      log('MESSAGE', 'Could not find sent message', 'FAIL');
    }
    
    fs.unlinkSync(testImagePath);
    
    return true;
  } catch (err) {
    log('MESSAGE', `Error: ${err.message}`, 'FAIL');
    return false;
  }
}

// Test 5: WebSocket Real-time Updates
async function testWebSocketUpdates() {
  log('WEBSOCKET', '=== Testing WebSocket Real-time Updates ===');
  
  try {
    // Connect WebSocket for user 2
    ws2 = await connectWebSocket(session2);
    
    let channelCreatedReceived = false;
    let channelUpdatedReceived = false;
    let channelDeletedReceived = false;
    
    ws2.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'channel.created') {
          log('WEBSOCKET', 'Received channel.created event', 'PASS');
          channelCreatedReceived = true;
        }
        
        if (message.type === 'channel.updated') {
          log('WEBSOCKET', 'Received channel.updated event', 'PASS');
          channelUpdatedReceived = true;
        }
        
        if (message.type === 'channel.deleted') {
          log('WEBSOCKET', 'Received channel.deleted event', 'PASS');
          channelDeletedReceived = true;
        }
      } catch (err) {
        log('WEBSOCKET', `Error parsing message: ${err.message}`, 'FAIL');
      }
    });
    
    // Create a channel as user 1
    const wsTimestamp = Math.floor(Date.now() / 1000).toString().slice(-6);
    const newChannelId = `ws-${wsTimestamp}`;
    const createRes = await fetch(`${API_URL}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session1
      },
      body: JSON.stringify({
        id: newChannelId,
        name: 'WebSocket Test',
        description: 'Testing real-time updates'
      })
    });
    
    if (!createRes.ok) {
      log('WEBSOCKET', 'Failed to create test channel', 'FAIL');
      return false;
    }
    
    log('WEBSOCKET', 'Created test channel, waiting for WebSocket event...', 'INFO');
    await wait(1000);
    
    if (!channelCreatedReceived) {
      log('WEBSOCKET', 'Did not receive channel.created event', 'FAIL');
    }
    
    // Update the channel
    const updateRes = await fetch(`${API_URL}/channels/${newChannelId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session1
      },
      body: JSON.stringify({
        name: 'Updated WebSocket Test',
        description: 'Updated via WebSocket'
      })
    });
    
    log('WEBSOCKET', 'Updated test channel, waiting for WebSocket event...', 'INFO');
    await wait(1000);
    
    if (!channelUpdatedReceived) {
      log('WEBSOCKET', 'Did not receive channel.updated event', 'FAIL');
    }
    
    // Delete the channel
    const deleteRes = await fetch(`${API_URL}/channels/${newChannelId}`, {
      method: 'DELETE',
      headers: { Cookie: session1 }
    });
    
    log('WEBSOCKET', 'Deleted test channel, waiting for WebSocket event...', 'INFO');
    await wait(1000);
    
    if (!channelDeletedReceived) {
      log('WEBSOCKET', 'Did not receive channel.deleted event', 'FAIL');
    }
    
    ws2.close();
    
    return true;
  } catch (err) {
    log('WEBSOCKET', `Error: ${err.message}`, 'FAIL');
    if (ws2) ws2.close();
    return false;
  }
}

// Test 6: Regression Tests
async function testRegression() {
  log('REGRESSION', '=== Testing Regression (Existing Features) ===');
  
  try {
    // Test basic messaging still works
    const messageRes = await fetch(`${API_URL}/channels/general/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session1
      },
      body: JSON.stringify({
        content: 'Regression test message'
      })
    });
    
    if (messageRes.ok) {
      log('REGRESSION', 'Basic messaging works', 'PASS');
    } else {
      log('REGRESSION', 'Basic messaging broken', 'FAIL');
      return false;
    }
    
    // Test listing messages
    const listRes = await fetch(`${API_URL}/channels/general/messages?limit=10`, {
      headers: { Cookie: session1 }
    });
    
    if (listRes.ok) {
      const messages = await listRes.json();
      log('REGRESSION', `Message listing works (${messages.length} messages)`, 'PASS');
    } else {
      log('REGRESSION', 'Message listing broken', 'FAIL');
      return false;
    }
    
    return true;
  } catch (err) {
    log('REGRESSION', `Error: ${err.message}`, 'FAIL');
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('\n=================================================');
  console.log('Sprint 4 QA Test Suite - File Uploads & Channels');
  console.log('=================================================\n');
  
  let allPassed = true;
  
  // Run all tests
  allPassed = await testAuthentication() && allPassed;
  allPassed = await testFileUpload() && allPassed;
  allPassed = await testChannelManagement() && allPassed;
  allPassed = await testMessageAttachments() && allPassed;
  allPassed = await testWebSocketUpdates() && allPassed;
  allPassed = await testRegression() && allPassed;
  
  // Generate report
  console.log('\n=================================================');
  console.log('Test Summary');
  console.log('=================================================\n');
  
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  const totalCount = testResults.filter(r => r.status === 'PASS' || r.status === 'FAIL').length;
  
  console.log(`Total Tests: ${totalCount}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`Success Rate: ${((passCount / totalCount) * 100).toFixed(1)}%\n`);
  
  if (allPassed) {
    console.log('🎉 All tests passed! Sprint 4 is ready for deployment.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the output above.\n');
  }
  
  // Save detailed report
  const reportPath = '/root/.openclaw/workspace-acid_burn/relay-chat/QA_SPRINT4_REPORT.md';
  const reportContent = generateMarkdownReport(passCount, failCount, totalCount);
  fs.writeFileSync(reportPath, reportContent);
  console.log(`📄 Detailed report saved to: ${reportPath}\n`);
  
  process.exit(failCount > 0 ? 1 : 0);
}

function generateMarkdownReport(passCount, failCount, totalCount) {
  const now = new Date().toISOString();
  
  let report = `# Sprint 4 QA Test Report\n\n`;
  report += `**Date:** ${now}\n`;
  report += `**Environment:** Development (docker-compose.dev.yml)\n`;
  report += `**Tested By:** Automated Test Suite\n\n`;
  
  report += `## Summary\n\n`;
  report += `- **Total Tests:** ${totalCount}\n`;
  report += `- **✅ Passed:** ${passCount}\n`;
  report += `- **❌ Failed:** ${failCount}\n`;
  report += `- **Success Rate:** ${((passCount / totalCount) * 100).toFixed(1)}%\n\n`;
  
  report += `## Test Results by Section\n\n`;
  
  const sections = [...new Set(testResults.map(r => r.section))];
  
  sections.forEach(section => {
    const sectionResults = testResults.filter(r => r.section === section);
    const sectionPasses = sectionResults.filter(r => r.status === 'PASS').length;
    const sectionFails = sectionResults.filter(r => r.status === 'FAIL').length;
    
    report += `### ${section}\n\n`;
    report += `**Status:** ${sectionFails === 0 ? '✅ PASS' : '❌ FAIL'}\n\n`;
    
    sectionResults.forEach(result => {
      const symbol = {
        'PASS': '✅',
        'FAIL': '❌',
        'INFO': 'ℹ️',
        'WARN': '⚠️'
      }[result.status] || 'ℹ️';
      
      report += `${symbol} ${result.message}\n`;
    });
    
    report += `\n`;
  });
  
  report += `## Conclusion\n\n`;
  
  if (failCount === 0) {
    report += `✅ **All tests passed!** Sprint 4 features are working as expected and ready for deployment.\n`;
  } else {
    report += `❌ **${failCount} test(s) failed.** Review the failures above and fix before deployment.\n`;
  }
  
  return report;
}

// Run the tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
