# Sprint 2 QA Test Report

**Date:** 2026-02-11  
**Tester:** QA Subagent (probe)  
**Status:** 🔴 CRITICAL BUGS FOUND

## Executive Summary

Sprint 2 messaging functionality is **BROKEN**. While the frontend UI and API endpoints exist, the core messaging features do not work due to a critical relay integration bug. The Nostr relay rejects all message events because the `#general` channel/group was never created on the relay side via NIP-29.

## Test Environment

- **Services:** All 4 containers running (frontend, api, relay, blossom)
- **Database:** Fresh database, clean start
- **Test Users:** 
  - Admin: admin / admin123
  - User2: user2 / user2pass

## Critical Bugs

### 🔴 BUG #1: Messages Cannot Be Sent (CRITICAL)
**Severity:** CRITICAL  
**Status:** BLOCKING

**Description:**  
Messages appear to send successfully (API returns 201), but they are NOT saved to the relay. The relay rejects all kind 9 (message) events with the error:

```
Event <id> failed: blocked: missing group (`h`) tag
```

**Root Cause:**  
The `#general` channel is created in the SQLite database during initialization, but it is **never published to the Nostr relay** as a NIP-29 group (kind 39000 metadata event). The relay (khatru29) requires groups to exist before accepting messages for them.

**Code Location:**  
`api/src/index.ts` lines 63-66:

```typescript
if (!channelExists('general')) {
  console.log('Creating default #general channel');
  createChannelRecord('general', 'general', 'Default channel for everyone');
  
  // Note: We can't publish to relay yet because no users exist
  // The channel will be published when the first user signs up
}
```

**Problem:** The comment says "The channel will be published when the first user signs up" but this never happens. The signup code does NOT publish the channel to the relay.

**Impact:**  
- ❌ Cannot send messages
- ❌ Cannot fetch messages  
- ❌ Cannot edit messages (404 - message doesn't exist)
- ❌ Cannot delete messages (404 - message doesn't exist)
- ❌ WebSocket never receives message events
- ❌ All Sprint 2 functionality is non-functional

**Evidence:**
```bash
# API says message sent
POST /api/v1/channels/general/messages
Response: {"message":"Message sent"}

# But relay logs show rejection
api-1  | Event 27db0c67... failed: blocked: missing group (`h`) tag

# And fetching returns empty array
GET /api/v1/channels/general/messages
Response: []
```

**Fix Required:**  
When the first admin user is created during signup, the system must publish a NIP-29 kind 39000 event to create the `#general` group on the relay. Options:

1. **Modify `api/src/routes/auth.ts`** - After creating first user, publish the general channel to relay
2. **Modify `api/src/index.ts`** - Change initDefaultChannel() to publish to relay immediately using a system keypair

**Proposed Fix:**

In `api/src/routes/auth.ts`, after creating the first user:

```typescript
// If this is the first user, ensure #general exists on relay
if (isFirstUser) {
  const nostrClient = getNostrClient();
  if (nostrClient.isConnected()) {
    const privkey = getUserNostrPrivkey(user.id);
    try {
      await nostrClient.createChannel(
        'general', 
        'general', 
        'Default channel for everyone', 
        privkey
      );
      console.log('#general channel published to relay');
    } catch (err) {
      console.error('Failed to publish #general to relay:', err);
    }
  }
}
```

---

### 🟡 BUG #2: API Returns Incorrect Response Format
**Severity:** MODERATE  
**Status:** NON-BLOCKING (masked by Bug #1)

**Description:**  
The POST /channels/:id/messages endpoint sometimes returns `{"message":"Message sent"}` instead of the full message object as specified in the API.

**Expected Response:**
```json
{
  "id": "event-id",
  "channelId": "general",
  "author": {...},
  "content": "...",
  "attachments": [],
  "reactions": {},
  "threadCount": 0,
  "createdAt": "2026-02-11T...",
  "editedAt": null
}
```

**Actual Response:**
```json
{"message":"Message sent"}
```

**Impact:**  
Frontend cannot display the message immediately without refetching the entire message list.

**Code Location:**  
Unknown - need to review POST /channels/:id/messages implementation to see why it returns different formats.

---

### 🟡 BUG #3: Edit/Delete Endpoints Not Implemented
**Severity:** MODERATE  
**Status:** CONFIRMED

**Description:**  
DELETE /messages/:id returns HTTP 501 with `{"message":"Not implemented"}`.

**Evidence:**
```bash
$ curl -X DELETE http://localhost:4000/api/v1/messages/<id> \
  -H "Authorization: Bearer <token>"

HTTP/1.1 501 Not Implemented
{"message":"Not implemented"}
```

**Expected:** HTTP 200 or 204 with successful deletion.

**Impact:**  
Users cannot delete messages even though the UI has delete buttons.

**Note:** The routes file (`api/src/routes/messages.ts`) has full implementation of DELETE endpoint, so this suggests the route may not be properly registered in the main app.

**Fix Required:**  
Check `api/src/index.ts` to ensure `messageRoutes` is properly mounted under `/api/v1/messages`.

---

## Test Results Summary

| Test Category | Pass | Fail | Skip |
|--------------|------|------|------|
| Setup | ✅ 2 | ❌ 0 | ⚠️ 0 |
| Authentication | ✅ 2 | ❌ 0 | ⚠️ 0 |
| Send Messages | ❌ 0 | ❌ 3 | ⚠️ 0 |
| Fetch Messages | ❌ 0 | ❌ 2 | ⚠️ 0 |
| Edit Messages | ❌ 0 | ❌ 2 | ⚠️ 0 |
| Delete Messages | ❌ 0 | ❌ 3 | ⚠️ 0 |
| WebSocket | ⚠️ 0 | ⚠️ 0 | ⚠️ 1 |
| **TOTAL** | **✅ 4** | **❌ 10** | **⚠️ 1** |

**Pass Rate:** 26.7% (4/15)

---

## Detailed Test Results

### ✅ SETUP - Verify Services
- ✅ API server is healthy (GET /health returns 200)
- ✅ Frontend is serving (port 3000 accessible)
- ✅ Relay is running (port 3334)
- ✅ All Docker containers up

### ✅ AUTH - Authentication Flow
- ✅ First user created successfully (becomes admin)
- ✅ Second user created with invite code
- ✅ Login works with correct credentials
- ✅ Session tokens generated

### ❌ TEST 1: Send Message to #general
**Status:** ❌ FAIL

```bash
POST /api/v1/channels/general/messages
Request: {"content":"QA Test Message - Sprint 2"}
Response: {"message":"Message sent"}
Expected: Full message object with .id field
```

**Issue:** Response format incorrect, no message ID returned.

### ❌ TEST 2: Fetch Messages from #general
**Status:** ❌ FAIL

```bash
GET /api/v1/channels/general/messages
Response: []
Expected: Array with at least 1 message
```

**Issue:** No messages returned despite sending messages in previous test. Messages were rejected by relay.

### ❌ TEST 3: Pagination
**Status:** ❌ FAIL

- Sent 5 test messages
- Full fetch returned 0 messages
- Paginated fetch returned 0 messages
- Expected: At least some messages with pagination working

### ❌ TEST 4: Edit Own Message
**Status:** ❌ FAIL

```bash
PATCH /api/v1/messages/<id>
Request: {"content":"Updated content"}
Response: 404 Not Found
```

**Issue:** Cannot edit because original message doesn't exist (wasn't saved to relay).

### ❌ TEST 5: Edit Another User's Message
**Status:** ❌ FAIL (False Negative)

```bash
Expected: 403 Forbidden
Actual: 404 Not Found
```

**Issue:** Test cannot run properly because messages don't exist. However, based on code review, the permission check IS implemented correctly in `api/src/routes/messages.ts`.

### ❌ TEST 6: Delete Own Message
**Status:** ❌ FAIL

```bash
DELETE /api/v1/messages/<id>
Response: HTTP 501 {"message":"Not implemented"}
Expected: HTTP 200/204
```

### ❌ TEST 7: Admin Delete Another User's Message
**Status:** ❌ FAIL

Same as Test 6 - returns 501 Not Implemented.

### ❌ TEST 8: Non-Admin Delete Another User's Message
**Status:** ❌ FAIL (False Negative)

Returns 501 instead of 403. Cannot verify permission logic.

### ⚠️ TEST 9: WebSocket Real-time Messaging
**Status:** SKIPPED

Cannot test WebSocket without working message sending. WebSocket code appears implemented but untestable.

---

## Frontend Testing

**Status:** NOT TESTED  
**Reason:** Backend is non-functional

### Manual Testing Required (After Backend Fix)

1. ✅ Message list renders with avatars, display names, timestamps
2. ⚠️ Can type and send messages (Enter to send, Shift+Enter for newline)
3. ⚠️ Markdown renders (bold, italic, code blocks)
4. ⚠️ Messages appear in real-time without refresh
5. ⚠️ Channel switching loads correct messages
6. ⚠️ Hover actions show edit/delete buttons
7. ⚠️ Edit mode works (inline editing with save/cancel)

**Instructions for Manual Testing:**

```
1. Open http://localhost:3000
2. Login: admin / admin123
3. Try sending a message
4. Try editing a message (hover over your message, click edit)
5. Try deleting a message
6. Open second browser/incognito window
7. Login as user2 / user2pass
8. Verify real-time message delivery
```

---

## Recommendations

### Immediate Actions Required

1. **FIX BUG #1 (CRITICAL)** - Ensure `#general` channel is published to relay as NIP-29 group
   - Add code to publish kind 39000 event during first user signup OR
   - Modify initDefaultChannel() to publish to relay using server keypair

2. **FIX BUG #3** - Verify message routes are properly mounted
   - Check `/api/v1/messages` route registration in `api/src/index.ts`
   - Ensure DELETE /messages/:id is accessible

3. **RE-RUN ALL TESTS** after fixing Bug #1

4. **MANUAL FRONTEND TESTING** required after backend is functional

### Code Review Findings

**Positive:**
- ✅ Route implementations in `messages.ts` and `channels.ts` look correct
- ✅ Permission checks are properly implemented (owner or admin)
- ✅ NostrClient methods are well-structured
- ✅ WebSocket handler appears complete

**Issues:**
- ❌ Channel initialization doesn't publish to relay
- ❌ No integration test coverage
- ⚠️ API response format inconsistency
- ⚠️ Error handling could be more consistent

### Sprint 2 Status

**Original Claim:** ✅ COMPLETE  
**Actual Status:** 🔴 INCOMPLETE - Core functionality broken

**Definition of Done:**
- ❌ Can send a message in #general and see it appear
- ❌ Messages persist (refresh page, they're still there)
- ❌ WebSocket connects and receives messages  
- ❌ Can edit own messages
- ❌ Can delete own messages
- ❌ Admin can delete any message
- ❌ Markdown renders properly
- ❌ Channel switching works

**Estimated Time to Fix:** 2-4 hours

---

## Logs & Evidence

### Relay Rejection Logs
```
api-1  | Event 27db0c67134720009aded7b54537f95faea6caa067d8f98132e9a63efda7c650 failed: blocked: missing group (`h`) tag
api-1  | Event e6139c8186fdbfa699dd2ac3f2592f3dcb3799e259711adc16c3b1b7f5974ec9 failed: blocked: missing group (`h`) tag
```

### API Test Output (Full Log)
```
========================================
   Relay Chat Sprint 2 QA Test Suite
========================================

### SETUP - Verify Services ###
✅ API server is healthy
✅ Frontend is serving

### AUTH - Create First User (Admin) ###
✅ Admin user created successfully
   Username: admin
   Token: 53301ad946073e82628482070f606a...

### TEST 1: Send Message to #general ###
❌ Failed to send message
   Response: {"message":"Message sent"}

### TEST 2: Fetch Messages from #general ###
❌ Failed to fetch messages
   Response: []

[... full test output as shown above ...]
```

---

## Conclusion

Sprint 2 cannot be marked as complete. The messaging system is non-functional due to missing Nostr relay integration for channel creation. All message-related features (send, fetch, edit, delete, WebSocket) are blocked by Bug #1.

**Next Steps:**
1. Developer must fix Bug #1 (channel creation)
2. Re-test all functionality
3. Conduct manual frontend testing
4. Update SPRINT2_COMPLETE.md with accurate status

**Recommended Actions:**
- Mark Sprint 2 as IN PROGRESS, not COMPLETE
- Create GitHub issues for bugs #1, #2, #3
- Add integration tests to prevent similar issues
- Consider E2E testing before marking sprints complete

---

**Report Generated:** 2026-02-11 07:50 MST  
**QA Agent:** probe (subagent)  
**Contact:** Via main agent
