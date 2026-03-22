# Direct Messages Design

## Overview

Add 1-on-1 direct messaging to Relay Chat. DMs support the full feature set of channels (threads, reactions, file attachments, link previews) scoped to exactly two participants. Plaintext storage, no encryption.

## Approach: DM Channels

Model DMs as a special type of channel. A `dm_conversations` table maps a conversation to a backing channel with `is_dm = TRUE`. All existing message, thread, reaction, file, and link preview logic works unchanged through the backing channel. WebSocket filtering ensures only the two participants receive events.

This reuses ~90% of existing code paths. The new work is: a thin DB layer, an access control gate, WebSocket filtering, and frontend UI for the DM sidebar section and user picker.

## Data Model

### New table: `dm_conversations`

| Column       | Type        | Description                        |
|-------------|-------------|-------------------------------------|
| `id`        | INTEGER PK  | Conversation ID                     |
| `channel_id`| INTEGER FK  | Backing channel (channels.id)       |
| `user1_id`  | INTEGER FK  | Lower user ID (canonical ordering)  |
| `user2_id`  | INTEGER FK  | Higher user ID                      |
| `created_at`| DATETIME    | When the DM was initiated           |

- UNIQUE constraint on `(user1_id, user2_id)` — one DM conversation per pair
- User IDs stored in canonical order (lower ID first) to prevent duplicates

### Changes to `channels` table

- Add `is_dm BOOLEAN DEFAULT FALSE` column
- DM channels are excluded from channel list, search, and browsing APIs
- DM backing channels use the naming convention `dm-{user1_id}-{user2_id}` (e.g., `dm-3-17`). The `channels.name` column has a UNIQUE constraint, and canonical user ID ordering guarantees uniqueness

### No changes to existing tables

`messages`, `reactions`, `files`, `channel_reads`, and all other tables remain untouched. Messages in a DM reference the backing `channel_id` like any other message.

## API Endpoints

### New DM endpoints

| Method | Path          | Description                                                                 |
|--------|---------------|-----------------------------------------------------------------------------|
| GET    | `/api/dms`    | List DM conversations for current user (last message preview, unread count) |
| POST   | `/api/dms`    | Start a DM (`{ "user_id": 123 }`) — returns existing if one exists         |
| GET    | `/api/dms/:id`| Get single DM conversation (metadata + other user's info)                   |

### Reused channel endpoints

Once the backing `channel_id` is known, all existing endpoints work unchanged:

- `GET /api/channels/:id/messages` — load messages
- `POST /api/channels/:id/messages` — send message
- `POST /api/channels/:id/messages/:id/reactions` — react
- `PUT /api/channels/:id/messages/:id` — edit
- `DELETE /api/channels/:id/messages/:id` — delete
- `POST /api/channels/:id/files` — upload
- `POST /api/channels/:id/read` — mark as read

### Access control

Two layers of protection:

1. **Channel-level gate:** A middleware check on all `/api/channels/:id/*` routes: if the channel has `is_dm = TRUE`, verify the requesting user is one of the two participants.
2. **Message-level routes:** Some endpoints use `/api/messages/{id}/*` paths (edit, delete, reactions) rather than nesting under `/api/channels/:id/`. These routes must also check: if the message belongs to a DM channel, verify the requesting user is a participant. The existing message ownership checks (only the author can edit/delete) already protect write operations, but read-adjacent operations (e.g., fetching a thread) need the DM participant check added.

### Changes to existing endpoints

- `GET /api/channels` — filter out `is_dm = TRUE` channels

## WebSocket Filtering

### Current behavior

The hub broadcasts every event to every connected authenticated client (except bots filtered by bound channels).

### New behavior

When an event originates from a DM channel, the hub delivers it only to the two participants.

### Implementation

- The `Event` struct already has a `ChannelID` field used for bot filtering. Same field is used to look up whether the channel is a DM.
- When broadcasting, if the channel is a DM, check `dm_conversations` (cached in memory) and only send to connections belonging to `user1_id` or `user2_id`.
- **Cache management:** The DM channel cache is a `map[int64][2]int64` (channel ID → participant pair). Populated on hub startup from the database. Updated synchronously when `POST /api/dms` creates a new conversation (before the response is sent), so the hub is always aware of new DMs before any messages can be sent through them.
- The hub needs to track which user owns each connection.

### Event types

All existing event types are filtered when they occur on a DM channel: `new_message`, `new_reply`, `reaction_added`, `reaction_removed`, `message_edited`, `message_deleted`. No new event types needed except:

- `dm_created` — sent to the recipient when someone initiates a DM, so their sidebar updates in real time.

### Push notifications

- DM messages trigger web push to the other participant using existing notification infrastructure.
- Notification text shows the sender's display name rather than a channel name (e.g., "Alice: hey, got a minute?").

## Frontend Architecture

### New store: `dms.svelte.ts`

- `conversations = $state<DMConversation[]>([])` — DM conversations with last message preview, unread count, and other user's info
- `load()` — fetches `GET /api/dms`
- `startDM(userId)` — calls `POST /api/dms`, returns conversation and navigates to it
- `markRead(dmId)` — delegates to existing channel read endpoint via backing `channel_id`
- Sorted by most recent message

### No changes to `messages.svelte.ts`

Messages load and send via the backing `channel_id`. The message store is unaware it's a DM.

### New route: `(app)/dms/[id]/+page.svelte`

- Reuses existing `MessageList` component, passing the backing `channel_id`
- Header shows the other user's display name and avatar instead of a channel name
- "Start DM" action from profile panels navigates here

### Sidebar changes

- New "Direct Messages" section below channels
- Each entry shows: other user's avatar, display name, last message snippet, unread badge
- "New Message" button (+ icon) opens a user search/picker modal
- Clicking a user anywhere in the app (message author, member list) shows a "Message" option that calls `dms.startDM(userId)`

### User picker component

- Search input hitting existing `SearchUsers` API
- Filters out the current user
- Selecting a user calls `startDM` and navigates to the conversation

### WebSocket handler changes (`ws.svelte.ts`)

- Handle `dm_created` event → add conversation to DM store
- Existing `new_message` events for DM channels → update DM store's last message preview and unread count alongside normal message store update

## Migration

Single migration file:
1. Add `is_dm` column to `channels` (default FALSE)
2. Create `dm_conversations` table with foreign keys and unique constraint

Non-destructive — no existing data is modified.

## Edge Cases

- **Deleted users:** DM conversations remain visible to the other participant as read-only archive. Messages show the deleted user's name as it was. No new messages can be sent.
- **Self-DM:** Prevented at API level — `POST /api/dms` rejects requests where `user_id` equals the current user.
- **Bot DMs:** Bots excluded from user picker and cannot be DM'd (they use existing channel binding system).
- **Race condition on creation:** Two users simultaneously starting a DM — UNIQUE constraint on `(user1_id, user2_id)` handles this. Second insert fails and falls back to returning existing conversation.
- **Unread counts:** Reuses existing `channel_reads` table since DMs have a backing channel.

## Out of Scope

- Encryption (future work)
- Group DMs (channels cover this use case)
- Blocking/muting users
- Read receipts / typing indicators / "seen" status
