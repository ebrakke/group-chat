# Notification Testing Guide

## Prerequisites

1. Sign up for a test notification service:
   - **ntfy.sh** (easiest, free): https://ntfy.sh
   - Create a unique topic (e.g., `relay-chat-test-12345`)
   - Download the ntfy mobile app (iOS/Android) or use web interface

## Test Scenarios

### Scenario 1: Mention Notification

**Goal:** Verify that users receive notifications when mentioned.

1. Create two users:
   - Alice (will receive notifications)
   - Bob (will send messages)

2. Log in as Alice and configure notification settings (gear icon):
   - Webhook URL: `https://ntfy.sh/relay-chat-test-12345`
   - Base URL: `http://localhost:8080`
   - Enable "Notify on @mentions"
   - Save settings

3. Log in as Bob

4. Send message in #general: `Hey @alice check this out`

5. **Expected Results:**
   - Alice receives notification on ntfy.sh app/web
   - Notification title: "@you mentioned in #general"
   - Notification body: "Hey @alice check this out"
   - Sender shown as "Bob"

6. **Test Deep Link:**
   - Tap/click notification
   - Should open browser to `http://localhost:8080/#/channel/1`
   - Should automatically switch to #general channel

### Scenario 2: Thread Reply Notification

**Goal:** Verify users are notified of replies to threads they participate in.

1. Log in as Bob

2. Send a message in #general: `What's everyone working on today?`

3. Log in as Alice

4. Reply to Bob's message (creates a thread)

5. Configure Alice's notifications:
   - Enable "Notify on thread replies"
   - Save settings

6. Log in as Bob

7. Reply to the thread: `Just finished the new feature!`

8. **Expected Results:**
   - Alice receives notification
   - Title: "New reply in #general"
   - Notification type: "thread_reply"
   - Thread context included in payload

9. **Test Deep Link:**
   - Tap/click notification
   - Should open to `http://localhost:8080/#/channel/1/thread/X`
   - Thread panel should open automatically

### Scenario 3: Thread Muting

**Goal:** Verify that muting a thread stops notifications.

1. Continue from Scenario 2 (Alice has notifications enabled)

2. As Alice, open the thread

3. Click the mute button (🔕 icon) in thread header

4. **Expected:**
   - Icon changes to 🔔 (bell)
   - Tooltip changes to "Unmute thread"

5. Log in as Bob

6. Reply again to the thread: `Another update!`

7. **Expected:**
   - Alice does NOT receive notification
   - No webhook call made for Alice

8. As Alice, click unmute button (🔔)

9. **Expected:**
   - Icon changes back to 🔕
   - Tooltip changes to "Mute thread"

10. As Bob, reply again: `Final update!`

11. **Expected:**
    - Alice receives notification again
    - Notifications resumed after unmute

### Scenario 4: All Messages Notification

**Goal:** Verify "notify on all messages" setting.

1. As Alice, configure notifications:
   - Enable "Notify on all messages"
   - Disable "Notify on @mentions" and "Notify on thread replies"
   - Save settings

2. Log in as Bob

3. Send message in #general: `Testing all messages notification`

4. **Expected Results:**
   - Alice receives notification
   - Type: "all_messages"
   - Title: "New message in #general"

5. Send several more messages

6. **Expected:**
   - Alice receives notification for each message
   - This can be noisy, demonstrating why it's opt-in

### Scenario 5: Invalid Webhook

**Goal:** Verify that webhook failures don't block message sending.

1. Configure webhook URL to invalid endpoint: `https://invalid-url-does-not-exist.example.com/webhook`

2. Save settings

3. Send a message that would trigger notification

4. **Expected Results:**
   - Message still sends successfully
   - No user-facing error
   - Error logged in server console: "Failed to send webhook notification"
   - Check server logs to verify error was logged

### Scenario 6: Multiple Users with Different Preferences

**Goal:** Verify that different users can have different notification settings.

1. Create three users: Alice, Bob, Charlie

2. Configure notifications:
   - Alice: Only mentions
   - Bob: Mentions + thread replies
   - Charlie: All messages

3. Log in as Alice and send: `Hey @bob and @charlie, check this out!`

4. **Expected Results:**
   - Bob receives notification (mentioned)
   - Charlie receives notification (all messages)
   - Alice does NOT receive notification (own message)

5. Bob replies to Alice's message

6. **Expected:**
   - Alice receives notification (thread reply)
   - Charlie receives notification (all messages)
   - Bob does NOT receive notification (own message)

### Scenario 7: Deep Link While App is Open

**Goal:** Verify deep links work when app is already open.

1. Open Relay Chat in browser

2. Navigate to #random channel

3. In another browser tab, open: `http://localhost:8080/#/channel/1/thread/5`

4. **Expected:**
   - First tab automatically switches to #general
   - Thread 5 opens automatically
   - Hash is cleared after navigation

## Webhook Payload Verification

Use a webhook inspection service like webhook.site or ntfy.sh web interface to inspect payloads:

1. Configure webhook URL to inspection endpoint

2. Trigger notification

3. Verify payload structure:
   ```json
   {
     "title": "@you mentioned in #general",
     "message": "message content (truncated if > 500 chars)",
     "sender": "Display Name",
     "channel": "general",
     "channelId": 1,
     "url": "https://chat.example.com/#/channel/1",
     "timestamp": "2026-02-17T12:34:56Z",
     "notificationType": "mention",
     "threadContext": null
   }
   ```

## Cleanup

1. Delete test webhook settings:
   - Clear webhook URL field
   - Save settings

2. Delete test users if needed

3. Delete test channels if needed

## Common Issues

**Notifications not received:**
- Check webhook URL is correct
- Verify ntfy.sh topic is unique (not already in use)
- Check browser console for errors
- Check server logs for webhook errors

**Deep links not working:**
- Verify Base URL is set correctly
- Check that channel/thread IDs exist
- Ensure browser allows hash navigation

**Thread mute button not appearing:**
- Ensure you're on the latest build
- Check that thread panel is open
- Refresh page if button is missing
