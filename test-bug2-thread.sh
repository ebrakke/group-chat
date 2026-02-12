#!/bin/bash

# Test script to reproduce Bug 2: Thread replies not appearing in thread fetch
API_URL="http://localhost:4002/api/v1"

echo "=== Testing Thread Reply Bug ==="
echo ""

# Step 1: Register a test user
echo "1. Registering test user..."
REGISTER_RESP=$(curl -s -X POST "$API_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpass123",
    "displayName": "Test User"
  }')
echo "Register response: $REGISTER_RESP"
TOKEN=$(echo "$REGISTER_RESP" | jq -r '.token')
echo "Token: $TOKEN"
echo ""

# Step 2: Post a message to #general
echo "2. Posting a message to #general..."
POST_MSG_RESP=$(curl -s -X POST "$API_URL/channels/general/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content": "Test message for thread"}')
echo "Post message response: $POST_MSG_RESP"
MSG_ID=$(echo "$POST_MSG_RESP" | jq -r '.id')
echo "Message ID: $MSG_ID"
echo ""

# Step 3: Post a thread reply
echo "3. Posting a thread reply..."
sleep 2  # Give Nostr time to process
REPLY_RESP=$(curl -s -X POST "$API_URL/messages/$MSG_ID/thread" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content": "This is my thread reply", "alsoSendToChannel": false}')
echo "Reply response: $REPLY_RESP"
REPLY_ID=$(echo "$REPLY_RESP" | jq -r '.id')
echo "Reply ID: $REPLY_ID"
echo ""

# Step 4: Fetch the thread
echo "4. Fetching thread replies (immediately after posting)..."
sleep 1
THREAD_RESP=$(curl -s -X GET "$API_URL/messages/$MSG_ID/thread" \
  -H "Authorization: Bearer $TOKEN")
echo "Thread response: $THREAD_RESP"
REPLY_COUNT=$(echo "$THREAD_RESP" | jq -r '.replies | length')
echo "Number of replies returned: $REPLY_COUNT"
echo ""

# Step 5: Fetch thread again after a delay
echo "5. Fetching thread replies again (after 3 second delay)..."
sleep 3
THREAD_RESP2=$(curl -s -X GET "$API_URL/messages/$MSG_ID/thread" \
  -H "Authorization: Bearer $TOKEN")
echo "Thread response: $THREAD_RESP2"
REPLY_COUNT2=$(echo "$THREAD_RESP2" | jq -r '.replies | length')
echo "Number of replies returned: $REPLY_COUNT2"
echo ""

# Step 6: Get the parent message to check threadCount
echo "6. Fetching channel messages to check threadCount..."
MESSAGES_RESP=$(curl -s -X GET "$API_URL/channels/general/messages" \
  -H "Authorization: Bearer $TOKEN")
THREAD_COUNT=$(echo "$MESSAGES_RESP" | jq -r ".messages[] | select(.id == \"$MSG_ID\") | .threadCount")
echo "Thread count on parent message: $THREAD_COUNT"
echo ""

echo "=== Test Summary ==="
echo "Expected: 1 reply, threadCount = 1"
echo "Actual: $REPLY_COUNT2 replies, threadCount = $THREAD_COUNT"
if [ "$REPLY_COUNT2" = "1" ] && [ "$THREAD_COUNT" = "1" ]; then
  echo "✅ BUG FIXED: Thread replies are appearing correctly!"
else
  echo "❌ BUG PRESENT: Thread replies not appearing!"
fi
