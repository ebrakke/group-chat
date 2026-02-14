# Flotilla NIP-29 Reference Analysis

> Focused review of [coracle-social/flotilla](https://github.com/coracle-social/flotilla) (v1.6.4)
> for NIP-29 relay-based group chat flows. SvelteKit 5 + welshman 0.8.x.

---

## 1. Group/Channel Modeling

### Hierarchy: Spaces and Rooms

Flotilla maps NIP-29 onto a Discord-like two-level structure:

| Concept | Nostr entity | Identifier | UI term |
|---------|-------------|------------|---------|
| Server | Relay (wss:// URL) | relay URL | **Space** |
| Channel | NIP-29 group | `h` tag value | **Room** |

A room is uniquely addressed by the tuple `(relay_url, h)`. Internally Flotilla
composites them into a single string ID:

```ts
// src/app/core/state.ts:499-501
export const makeRoomId = (url: string, h: string) => `${url}'${h}`
export const splitRoomId = (id: string) => id.split("'")
```

NIP-29 capability is detected from NIP-11 relay info:

```ts
// src/app/core/state.ts:503-504
export const hasNip29 = (relay?: RelayProfile) =>
  relay?.supported_nips?.map?.(String)?.includes?.("29")
```

The `SpaceMenu` component (`src/app/components/SpaceMenu.svelte:224`) uses this
to conditionally show room-based UI vs plain chat.

### h tag vs d tag

Both appear in NIP-29, serving different roles:

- **`h` tag** -- group membership reference. Used in message events, join/leave,
  add/remove-member events to say "this event belongs to room X."
  Filter pattern: `{"#h": [h]}`
- **`d` tag** -- parameterised replaceable event identifier. Used in ROOM_META
  (39000), ROOM_MEMBERS (39002), ROOM_ADMINS (39001) so those events are
  addressable by `kind:pubkey:d`. Filter pattern: `{"#d": [h]}`

Both tags carry the same `h` value for a given room. Flotilla queries them
correctly:

```ts
// src/app/core/state.ts:744-746  (room members derivation)
const filters: Filter[] = [
  {kinds: [ROOM_MEMBERS], "#d": [h]},           // addressable state event
  {kinds: [ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER], "#h": [h]},  // action events
]
```

### Room Metadata (kind 39000 / ROOM_META)

The `PublishedRoomMeta` type (from `@welshman/util`) is parsed by `readRoomMeta()`.
Flotilla extends it with routing info:

```ts
// src/app/core/state.ts:494-497
export type Room = PublishedRoomMeta & {
  id: string   // makeRoomId(url, h)
  url: string  // relay URL
}
```

Fields exposed in the room create/edit form (`src/app/components/RoomForm.svelte`):

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Display name |
| `about` | string | Description |
| `picture` | URL | Avatar/icon |
| `isRestricted` | bool | Only members can post |
| `isPrivate` | bool | Only members can read |
| `isHidden` | bool | Not listed for non-members |
| `isClosed` | bool | Join requests ignored |

These map to the NIP-29 access flags. Rooms without any flag are public.

### User Group List (kind 10009 / ROOMS)

Each user maintains a single NIP-51-style list (kind 10009) with their space and
room subscriptions. Tags:

```
["r", "wss://relay.example.com"]           -- space membership
["group", "general", "wss://relay.example.com"]  -- room membership
```

The list is NIP-44 encrypted to self (`nip44EncryptToSelf`) and published to the
user's outbox relays. See `src/app/core/commands.ts:134-170`.

### URL Routing

```
/spaces/{base64(relay_url)}/{h}       -- room view
/spaces/{base64(relay_url)}/chat      -- space-wide chat (no h filter)
/spaces/{base64(relay_url)}/recent    -- recent activity
/spaces/{base64(relay_url)}/threads   -- long-form threads
```

Defined in `src/app/util/routes.ts`.

---

## 2. Event Kinds for Messages, Replies, Reactions, Edits, Deletes

### Kind Map

| welshman const | Kind | NIP-29 role | Flotilla usage |
|----------------|------|-------------|----------------|
| `MESSAGE` | 9 | Group chat message | Primary room messages |
| `THREAD` | 11 | Group thread root | Long-form posts with `["title", ...]` tag |
| `COMMENT` | 1111 | NIP-22 comment | Replies to any content, uses `tagEventForComment()` |
| `REACTION` | 7 | Emoji reaction | Emoji reactions on messages |
| `DELETE` | 5 | Deletion request | Author deletes own events; also used for "edit" |
| `REPORT` | 1984 | Content report | User reports to relay admin |
| `CLASSIFIED` | 30402 | Classified listing | Marketplace postings |
| `ZAP_GOAL` | 9041 | Fundraising goal | Zap goals |
| `EVENT_TIME` | 31923 | Calendar event | Calendar entries |

**Aggregate constant arrays** (`src/app/core/state.ts:264-282`):

```ts
export const CONTENT_KINDS = [ZAP_GOAL, EVENT_TIME, THREAD, CLASSIFIED]
export const MESSAGE_KINDS = [...CONTENT_KINDS, MESSAGE]  // [9041, 31923, 11, 30402, 9]
export const REACTION_KINDS = [REPORT, DELETE, REACTION]  // [1984, 5, 7]  (+ZAP_RESPONSE if enabled)
```

### Message Creation

Room messages (`src/routes/spaces/[relay]/[h]/+page.svelte:112-158`):

```ts
const onSubmit = async ({content, tags}: EventContent) => {
  tags.push(["h", h])                     // room identifier
  if (await shouldProtect) tags.push(PROTECTED)  // ["-"] tag
  // ... handle edit, share, reply ...
  publishThunk({
    relays: [url],
    event: makeEvent(MESSAGE, template),   // kind 9
    delay: $userSettingsValues.send_delay,
  })
}
```

The `PROTECTED` tag is `["-"]` (`src/app/core/state.ts:127`), signalling that the
relay should not forward this event outside the group (NIP-70).

### Thread Replies (NIP-22 COMMENT, not NIP-10)

Flotilla uses **NIP-22 COMMENT (kind 1111)**, not classic NIP-10 reply markers,
for threaded replies on content. The `tagEventForComment()` function (from
welshman) builds the reply tag structure.

```ts
// src/app/core/commands.ts:344-345
export const makeComment = ({url, event, content, tags = []}: CommentParams) =>
  makeEvent(COMMENT, {content, tags: [...tags, ...tagEventForComment(event, url)]})
```

For **quoting/sharing** a message, `prependParent()` encodes a `nevent` URI and
adds a quote tag via `tagEventForQuote()`:

```ts
// src/app/core/commands.ts:102-116
tags = [...tags, tagEventForQuote(parent, url), tagPubkey(parent.pubkey)]
content = toNostrURI(nevent) + "\n\n" + content
```

Reply filters use welshman's `getReplyFilters()` which handles NIP-10/NIP-22
marker discovery.

### Reactions (kind 7)

```ts
// src/app/core/commands.ts:310-333
export const makeReaction = ({url, protect, content, event, tags: paramTags = []}) => {
  const tags = [...paramTags, ...tagEventForReaction(event, url)]
  const groupTag = getTag("h", event.tags)
  if (groupTag) tags.push(groupTag)        // propagate room identity
  if (protect) tags.push(PROTECTED)
  return makeEvent(REACTION, {content, tags})
}
```

Reactions support custom emoji via `["emoji", name, url]` tags. Grouped in
`ReactionSummary.svelte` by emoji content.

### Edits (Delete + Republish)

Flotilla has **no NIP-specific edit event kind**. Edits are implemented as:
1. Delete the original (kind 5) preserving the `h` tag
2. Republish a new MESSAGE with the **same `created_at` timestamp**

```ts
// src/routes/spaces/[relay]/[h]/+page.svelte:121-128
if (eventToEdit) {
  template.created_at = eventToEdit.created_at    // preserve timestamp
  publishDelete({relays: [url], event: $state.snapshot(eventToEdit), protect: await shouldProtect})
}
```

This is a pragmatic approach but means edits are indistinguishable from new
messages if the delete hasn't propagated.

### Deletes (kind 5)

```ts
// src/app/core/commands.ts:257-269
export const makeDelete = ({protect, event, tags = []}: DeleteParams) => {
  const thisTags = [["k", String(event.kind)], ...tagEvent(event), ...tags]
  const groupTag = getTag("h", event.tags)
  if (groupTag) thisTags.push(groupTag)   // room context
  if (protect) thisTags.push(PROTECTED)
  return makeEvent(DELETE, {tags: thisTags})
}
```

Admin delete uses relay management API, not kind 5:

```ts
// src/app/components/RoomItemMenu.svelte:48-50
manageRelay(url, { method: ManagementMethod.BanEvent, params: [event.id] })
```

---

## 3. Membership / Join / Invite Flows

### Kind Table for Membership Events

| welshman const | Kind | Direction | Purpose |
|----------------|------|-----------|---------|
| `RELAY_JOIN` | 28934 | client -> relay | Request to join space |
| `RELAY_LEAVE` | 28936 | client -> relay | Leave space |
| `RELAY_INVITE` | 28935 | relay -> client | Invite code (claim) |
| `RELAY_MEMBERS` | 13534 | relay-generated | Full member snapshot |
| `RELAY_ADD_MEMBER` | 8000 | relay-generated | Member added |
| `RELAY_REMOVE_MEMBER` | 8001 | relay-generated | Member removed |
| `ROOM_JOIN` | 9021 | client -> relay | Request to join room |
| `ROOM_LEAVE` | 9022 | client -> relay | Leave room |
| `ROOM_ADD_MEMBER` | 9000 | relay-generated | Member added to room |
| `ROOM_REMOVE_MEMBER` | 9001 | relay-generated | Member removed from room |
| `ROOM_MEMBERS` | 39002 | relay-generated | Room member snapshot |
| `ROOM_ADMINS` | 39001 | relay-generated | Room admin list |
| `ROOM_META` | 39000 | relay-generated | Room metadata |
| `ROOM_DELETE` | 9008 | relay-generated | Room deleted |
| `ROOM_CREATE_PERMISSION` | 19004 | relay-generated | User can create rooms |

### Join Flow

**Space join** (`src/app/core/commands.ts:182-213`, `src/app/components/SpaceJoin.svelte`):

1. Open socket, attempt NIP-42 AUTH
2. Publish `RELAY_JOIN` (kind 28934) with optional `["claim", inviteCode]` tag
3. Wait for OK or error
4. On success, call `addSpaceMembership(url)` which updates the user's kind 10009
   list with `["r", url]`

```ts
export const makeJoinRequest = (params: JoinRequestParams) =>
  makeEvent(RELAY_JOIN, {tags: [["claim", params.claim]]})
```

**Room join** uses welshman's `joinRoom()` from `@welshman/app` which publishes
`ROOM_JOIN` (kind 9021). Then `addRoomMembership(url, h)` updates kind 10009
with `["group", h, url]`.

### Leave Flow

```ts
// src/app/core/commands.ts:430-431
export const publishLeaveRequest = (params: LeaveRequestParams) =>
  publishThunk({event: makeEvent(RELAY_LEAVE), relays: [params.url]})
```

Then `removeSpaceMembership(url)` strips the `["r", url]` tag from kind 10009.

### Invite Codes (kind 28935 / RELAY_INVITE)

Flotilla fetches invite codes (called "claims") from the relay:

```ts
// src/app/core/requests.ts:254-261
export const requestRelayClaim = async (url: string) => {
  const filters = [{kinds: [RELAY_INVITE], limit: 1}]
  const events = await load({filters, relays: [url]})
  if (events.length > 0) {
    return getTagValue("claim", events[0].tags)
  }
}
```

The claim string is then passed in the join request's `["claim", ...]` tag.
The invite link UI is in `SpaceInvite.svelte`.

### Membership State Derivation

Flotilla derives membership from relay-generated state events. Two strategies
are used, with fallback:

**Strategy 1 -- Snapshot event**: If a `RELAY_MEMBERS` (13534) or `ROOM_MEMBERS`
(39002) event exists, extract all `p` tags directly.

**Strategy 2 -- Action log replay**: If no snapshot, replay `ADD_MEMBER` /
`REMOVE_MEMBER` events in reverse chronological order:

```ts
// src/app/core/state.ts:743-776
export const deriveRoomMembers = (url: string, h: string) => {
  // ... filters for ROOM_MEMBERS + ROOM_ADD/REMOVE_MEMBER ...
  return derived(deriveEventsForUrl(url, filters), $events => {
    const membersEvent = find(spec({kind: ROOM_MEMBERS}), $events)
    if (membersEvent) return uniq(getPubkeyTagValues(membersEvent.tags))

    const members = new Set<string>()
    for (const event of sortBy(e => -e.created_at, $events)) {
      if (event.kind === ROOM_ADD_MEMBER)
        getPubkeyTagValues(event.tags).forEach(pk => members.add(pk))
      if (event.kind === ROOM_REMOVE_MEMBER)
        getPubkeyTagValues(event.tags).forEach(pk => members.delete(pk))
    }
    return Array.from(members)
  })
}
```

### Membership Status Enum

```ts
// src/app/core/state.ts:794-798
export enum MembershipStatus {
  Initial,   // not a member, hasn't requested
  Pending,   // sent RELAY_JOIN/ROOM_JOIN, not yet in members list
  Granted,   // appears in members list
}
```

The derivation (`deriveUserSpaceMembershipStatus`, line 800+) checks:
- Is user in members list? -> Granted
- Did user publish RELAY_JOIN? -> Pending (or Granted if also in list)
- Did user publish RELAY_LEAVE? -> Initial

### Admin Operations via Relay Management API

Space-level admin actions use `manageRelay()` from welshman, NOT NIP-29 event
kinds. These are JSON-RPC-style calls to the relay:

| ManagementMethod | Usage |
|-----------------|-------|
| `AllowPubkey` | Add member to space (`SpaceMembersAdd.svelte`) |
| `BanPubkey` | Ban user from space (`SpaceMembers.svelte`) |
| `BanEvent` | Admin-delete a message (`RoomItemMenu.svelte`) |
| `ChangeRelayName` | Edit space name (`SpaceEdit.svelte`) |
| `ChangeRelayDescription` | Edit space description |
| `ChangeRelayIcon` | Edit space icon |
| `ListBannedPubkeys` | List banned users (`SpaceMembersBanned.svelte`) |

Room admin operations (create, edit, delete, add/remove member) use welshman's
`createRoom`, `editRoom`, `deleteRoom`, `joinRoom`, `leaveRoom`,
`addRoomMember`, `removeRoomMember` from `@welshman/app`.

---

## 4. Timeline Previous Tags

### Finding: Flotilla Does NOT Use `previous` Tags

The NIP-29 spec describes optional `previous` tags for causal ordering of group
events. **Flotilla completely ignores them.** No code in the repository creates,
validates, or reads `previous` tags.

### Actual Ordering Strategy

Messages are ordered by `created_at` timestamp with binary insertion:

```ts
// src/app/core/requests.ts:50-80 (simplified)
const insertEvent = (event: TrustedEvent) => {
  if (seen.has(event.id)) return          // dedup by event ID

  events.update($events => {
    for (let i = 0; i < $events.length; i++) {
      if ($events[i].id === event.id) return $events
      if ($events[i].created_at < event.created_at) {
        return insertAt(i, event, $events)  // insert by timestamp
      }
    }
    return $events
  })
  seen.add(event.id)
}
```

The room view (`src/routes/spaces/[relay]/[h]/+page.svelte:199+`) iterates in
reverse and then re-reverses for display, producing chronological order.

### Deduplication

Three layers:
1. **Feed level**: `seen` Set in `makeFeed()` (`requests.ts`)
2. **Component level**: `seen` Set in render loop (`[h]/+page.svelte`)
3. **Repository level**: welshman's `deriveDeduplicated` utility

### Subscription Filters

```ts
// src/app/core/sync.ts:256-268 (syncSpace)
const since = ago(WEEK)
pullAndListen({
  url,
  filters: [{kinds: MESSAGE_KINDS, since}, makeCommentFilter(CONTENT_KINDS, {since})],
})
```

Uses negentropy reconciliation when the relay supports it, with fallback to
`since`-based request. Pagination is infinite scroll loading 30 events at a
time from a 100-event buffer.

---

## 5. Gotchas and Deviations from Spec

### What Flotilla Gets Right (Copy These)

1. **Clean h/d tag separation**: `h` for action events, `d` for addressable state
   events. Consistent throughout.

2. **Dual membership derivation**: Snapshot event (ROOM_MEMBERS) with fallback to
   action-log replay (ADD/REMOVE). Handles both relay implementations.

3. **PROTECTED tag `["-"]`**: Applied to all group events, preventing relay
   forwarding outside the group (NIP-70).

4. **Group tag propagation**: Reactions and deletes copy the `h` tag from the
   parent event, ensuring they're scoped to the room.

5. **NIP-42 auth before join**: Always authenticates with the relay before
   publishing RELAY_JOIN. Handles auth failures gracefully.

6. **Separated sync filters**: Room metadata, membership, messages, and reactions
   each get their own subscription. Avoids relay filter compatibility issues.

7. **Trust policy for unsigned events**: NIP-29 relay-generated events lack
   signatures. Flotilla buffers them until the user trusts the relay
   (`src/app/util/policies.ts:57-82`).

### Deviations / Gotchas (Avoid or Be Aware)

1. **No `previous` tag support**: Ordering relies entirely on `created_at`.
   Vulnerable to timestamp manipulation. For a chat app this is fine in
   practice but doesn't match NIP-29's causal ordering intent.

2. **Edit = delete + republish with same timestamp**: Not a standard NIP edit
   (there is no kind 9005 or similar). The republished message has a new event
   ID, so any reactions/replies to the original become orphaned. There's a race
   condition if the delete hasn't propagated before the new message arrives.

3. **Welshman kind numbers diverge from NIP-29 spec numbers in some cases**:
   The welshman library defines its own kind constants. For example:
   - `RELAY_JOIN` = 28934, `RELAY_LEAVE` = 28936 (NIP-29 doesn't define
     space-level join/leave -- these are a welshman/flotilla extension)
   - `RELAY_ADD_MEMBER` = 8000, `RELAY_REMOVE_MEMBER` = 8001 (space-level,
     not in NIP-29 spec which is room-level only)
   - Standard NIP-29 kinds: ROOM_ADD_MEMBER=9000, ROOM_REMOVE_MEMBER=9001,
     ROOM_JOIN=9021, ROOM_LEAVE=9022, ROOM_META=39000 -- these DO match.

4. **Space-level management via JSON-RPC, not events**: Admin operations like
   ban/unban use `manageRelay()` (welshman's relay management protocol), not
   standard NIP-29 admin event kinds. This is relay-implementation-specific.

5. **No kind 9002 (edit-metadata) from client**: Room metadata changes go
   through welshman's `editRoom()` which likely sends kind 9002 internally,
   but flotilla doesn't reference kind 9002 directly.

6. **COMMENT (1111) for replies, not threaded kind-9 messages**: NIP-10-style
   replies within kind 9 messages aren't used. Instead, NIP-22 COMMENT events
   (kind 1111) are used for all threaded replies to content. This means reply
   threads are separate events with `#K` tags referencing the parent kind.

7. **Week-old message window**: `syncSpace` only pulls messages from the last
   7 days (`ago(WEEK)`). Older history requires manual scroll-to-load which
   triggers paginated REQs. Consider whether this is sufficient for your UX.

8. **No offline queue for sends**: Messages are published immediately via
   `publishThunk`. There's an optional send delay (user setting) but no
   queue for offline-then-sync.

---

## 6. Recommendations for Our App

### Event Contract

Adopt the following kinds and tag structures:

```
MESSAGE (kind 9):
  tags: [["h", roomId], ["-"]]
  content: plaintext message

COMMENT (kind 1111):
  tags: [...tagEventForComment(parent, relayUrl)]
  content: reply text
  -- OR use kind 9 with NIP-10 reply tags if you prefer simpler threading

REACTION (kind 7):
  tags: [...tagEventForReaction(target, relayUrl), ["h", roomId]]
  content: emoji string ("+", "-", or emoji)

DELETE (kind 5):
  tags: [["k", originalKind], ["e", eventId], ["h", roomId]]

RELAY_JOIN (kind 28934):        -- or 9021 for room-level
  tags: [["claim", inviteCode]]  -- optional

RELAY_LEAVE (kind 28936):       -- or 9022 for room-level
  tags: []

ROOMS list (kind 10009):
  tags: [["r", relayUrl], ["group", h, relayUrl], ...]
  content: NIP-44 encrypted
```

### What to Unit Test

| Test area | What to verify | Priority |
|-----------|---------------|----------|
| **h tag on messages** | Every kind-9 event includes `["h", roomId]` | High |
| **h tag propagation** | Reactions/deletes copy `h` from parent event | High |
| **PROTECTED tag** | `["-"]` present on all group events | High |
| **Membership derivation** | Snapshot path (ROOM_MEMBERS) produces correct set | High |
| **Membership derivation** | Action-log replay (ADD/REMOVE) produces correct set | High |
| **Membership status FSM** | Initial -> Pending (join) -> Granted (in list) -> Initial (leave) | High |
| **Delete tag structure** | kind 5 includes `["k", origKind]`, `["e", id]`, `["h", h]` | Medium |
| **Edit flow** | Delete + republish preserves `created_at` | Medium |
| **Room ID composite** | `makeRoomId` / `splitRoomId` roundtrip | Medium |
| **Group list updates** | `addSpaceMembership` adds `["r", url]` tag to kind 10009 | Medium |
| **Group list updates** | `addRoomMembership` adds `["group", h, url]` tag | Medium |
| **Deduplication** | Same event ID inserted twice -> only one copy | Medium |
| **Timestamp ordering** | Events inserted in correct position by `created_at` | Medium |
| **Comment tags** | `tagEventForComment()` produces valid NIP-22 structure | Medium |
| **Invite claim** | RELAY_JOIN with `["claim", code]` accepted by relay | Low |
| **NIP-29 detection** | `hasNip29()` correctly parses relay supported_nips | Low |
| **Trust policy** | Unsigned events from untrusted relays are buffered | Low |

### Architecture Recommendations

1. **Copy the dual-membership strategy**: Support both snapshot events and
   action-log replay. It's the most resilient approach.

2. **Copy PROTECTED tag usage**: Always include `["-"]` on group events.

3. **Copy separated sync subscriptions**: Don't combine metadata + messages +
   reactions into one filter.

4. **Consider adding `previous` tag support**: Even basic support (include the
   tag when sending, use it as tiebreaker in ordering) would improve on
   flotilla's implementation. Full causal ordering is complex but worth
   considering for correctness.

5. **Consider a proper edit kind**: Instead of delete+republish, explore using
   a dedicated edit mechanism that preserves the original event ID as a
   reference. This avoids orphaning replies/reactions.

6. **Add offline send queue**: Buffer outgoing events when the relay connection
   is down, flush on reconnect. Flotilla doesn't do this.

7. **Auth policy**: Copy flotilla's approach of auto-authenticating (NIP-42)
   to relays where the user has space membership.

---

## Key File Reference

| File | What it does |
|------|-------------|
| `src/app/core/state.ts` | Central state: room/space types, membership derivation, kind imports |
| `src/app/core/commands.ts` | Event creation: join, leave, delete, react, comment, group list updates |
| `src/app/core/sync.ts` | Subscription management: `syncSpace()`, pull+listen pattern |
| `src/app/core/requests.ts` | Feed construction, pagination, invite claim fetching |
| `src/app/util/policies.ts` | Socket policies: NIP-42 auth, trust, blocking |
| `src/app/util/routes.ts` | URL routing helpers |
| `src/app/util/storage.ts` | IndexedDB persistence, kind categorization |
| `src/app/components/RoomForm.svelte` | Room create/edit form (access flags) |
| `src/app/components/RoomCompose.svelte` | Message composer (TipTap editor) |
| `src/app/components/RoomItem.svelte` | Message display, reactions, actions |
| `src/app/components/SpaceJoin.svelte` | Space join flow |
| `src/app/components/SpaceMenu.svelte` | Space sidebar, room list, NIP-29 detection |
| `src/routes/spaces/[relay]/[h]/+page.svelte` | Room view: message list, compose, edit, ordering |
| `src/routes/spaces/[relay]/chat/+page.svelte` | Space-wide chat (no h-tag filter) |
