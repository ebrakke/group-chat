#!/bin/bash

echo "=============================================="
echo " COMPREHENSIVE BUG FIX VERIFICATION"
echo "=============================================="
echo ""

# Test Bug 1: WebSocket through Caddy proxy
echo ">>> Testing BUG 1: WebSocket Event Delivery Through Caddy"
echo "---------------------------------------------------"
node test-websocket-proxy.js
BUG1_STATUS=$?
echo ""

# Test Bug 2: Thread replies
echo ">>> Testing BUG 2: Thread Replies Appearing in Fetch"
echo "---------------------------------------------------"
API_URL="http://localhost:3001/api/v1"
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}' | jq -r '.token')

# Post a new message for testing thread
MSG_RESP=$(curl -s -X POST "$API_URL/channels/general/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content": "Final test message for thread"}')
MSG_ID=$(echo "$MSG_RESP" | jq -r '.id')
echo "Posted test message: $MSG_ID"

# Post a thread reply
sleep 1
REPLY_RESP=$(curl -s -X POST "$API_URL/messages/$MSG_ID/thread" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content": "Final thread reply test", "alsoSendToChannel": false}')
REPLY_ID=$(echo "$REPLY_RESP" | jq -r '.id')
echo "Posted thread reply: $REPLY_ID"

# Fetch thread
sleep 2
THREAD_RESP=$(curl -s -X GET "$API_URL/messages/$MSG_ID/thread" \
  -H "Authorization: Bearer $TOKEN")
REPLY_COUNT=$(echo "$THREAD_RESP" | jq -r '.replies | length')

# Fetch channel messages to check threadCount
MESSAGES_RESP=$(curl -s -X GET "$API_URL/channels/general/messages" \
  -H "Authorization: Bearer $TOKEN")
THREAD_COUNT=$(echo "$MESSAGES_RESP" | jq -r ".[0].threadCount // 0")

echo "Thread replies found: $REPLY_COUNT"
echo "Thread count on parent: $THREAD_COUNT"

if [ "$REPLY_COUNT" -ge "1" ]; then
  echo "✅ Thread replies are being returned correctly"
  BUG2_STATUS=0
else
  echo "❌ Thread replies NOT being returned"
  BUG2_STATUS=1
fi

echo ""
echo "=============================================="
echo " FINAL RESULTS"
echo "=============================================="

if [ $BUG1_STATUS -eq 0 ] && [ $BUG2_STATUS -eq 0 ]; then
  echo "✅ ALL BUGS FIXED!"
  echo ""
  echo "BUG 1: WebSocket through Caddy proxy ✅"
  echo "BUG 2: Thread replies appearing in fetch ✅"
  echo ""
  exit 0
else
  echo "❌ SOME BUGS STILL PRESENT"
  echo ""
  echo "BUG 1: WebSocket through Caddy proxy $([ $BUG1_STATUS -eq 0 ] && echo '✅' || echo '❌')"
  echo "BUG 2: Thread replies appearing in fetch $([ $BUG2_STATUS -eq 0 ] && echo '✅' || echo '❌')"
  echo ""
  exit 1
fi
