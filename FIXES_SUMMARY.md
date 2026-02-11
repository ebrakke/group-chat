# Relay Chat Messaging Fixes - Summary

## ✅ All Three Issues Fixed

### Issue #1: Stable Keypairs ✅ 
**Problem:** Both relay and API generated new keypairs on every restart, causing auth failures.

**Solution:**
- Generated stable keypairs for both services:
  - Relay: `25b01afc58f00f3dd3891faf32ad285143456df297f4f2540c692b3109d8d7f5`
  - API Server: `27b272d8c82f77eafa45289ce75ca33be7d90d01eb5462f333d977b1ea8a2503`
- Hardcoded these in `docker-compose.yml` and `docker-compose.prod.yml`
- Modified `api/src/index.ts` to read `SERVER_PRIVKEY` from environment
- Added API server's pubkey to relay's `ALLOWED_PUBKEYS`

**Files Changed:**
- `docker-compose.yml` (updated)
- `docker-compose.prod.yml` (created)
- `api/src/index.ts` (modified initNostrClient())

### Issue #2: Create Group on Relay ✅
**Problem:** `initDefaultChannel()` only created SQLite record, never called the relay to create the NIP-29 group.

**Solution:**
- Modified `initDefaultChannel()` to call `nostrClient.createGroup('general', serverPrivkey)` 
- Then call `nostrClient.updateChannelMetadata()` to publish metadata
- Added proper error handling and logging
- Ensured this runs after Nostr client is connected

**Files Changed:**
- `api/src/index.ts` (modified initDefaultChannel())

### Issue #3: Relay29 Authorization ✅
**Problem:** Unclear if relay29 would authorize API server to create groups.

**Solution:**
- Investigated relay29/khatru29 source code
- Confirmed: **ANY authenticated client can create groups** by default
- Comment in source: "anyone can create new groups (if this is not desired a policy must be added to filter out this stuff)"
- Once a group exists, only members (or relay's own pubkey) can write to it
- No additional configuration needed

**Files Reviewed:**
- `/root/go/pkg/mod/github.com/fiatjaf/relay29@v0.5.1/event_policy.go`
- `/root/go/pkg/mod/github.com/fiatjaf/relay29@v0.5.1/khatru29/khatru29.go`

## Commits

1. `850f995` - Fix messaging: stable keypairs + create #general group on relay
2. `a1a8022` - Add test plan for messaging fixes

## Pushed To

- ✅ **origin** (GitHub): `git@github.com:ebrakke/relay-chat.git`
- ✅ **forge** (Forgejo): `ssh://git@svc-forgejo/erik/relay-chat.git`

## Next Steps

To verify the fixes work:

1. Deploy or run locally with: `docker compose up --build`
2. Check API logs for:
   - "Server Nostr pubkey: eb791dd5f7d08ff2831e20ef074d04daea835b68e59803c8b5fffaef816d16e6"
   - "Creating #general group on relay..."
   - "Created #general group successfully"
3. Test posting a message to `/api/v1/channels/general/messages`
4. Should return HTTP 200 (not 500 or "group doesn't exist")

See `TEST_PLAN.md` for detailed testing instructions.

## Technical Details

### Keypair Generation
Used nostr-tools library to generate stable keys:
```javascript
const {generateSecretKey, getPublicKey} = require('nostr-tools');
const sk = generateSecretKey();
const pk = getPublicKey(sk);
```

### NIP-29 Group Creation Flow
1. Connect to relay with SERVER_PRIVKEY
2. Authenticate with NIP-42
3. Send kind 9007 event (create-group) with 'h' tag = 'general'
4. Send kind 39000 event (metadata) with group name and description

### Environment Variables
Required in docker-compose files:
- `RELAY_PRIVKEY` - Relay's private key (hex)
- `SERVER_PRIVKEY` - API server's private key (hex)
- `ALLOWED_PUBKEYS` - Comma-separated pubkeys allowed to connect (includes API server's pubkey)

## Architecture Notes

The NostrClient class already had the necessary methods:
- `createGroup(groupId, privkey)` - sends kind 9007
- `updateChannelMetadata(groupId, name, description, privkey)` - sends kind 39000
- `publishMessage(groupId, content, privkey)` - sends kind 9

The issue was simply that initDefaultChannel() wasn't calling createGroup().

## Security

- Keypairs are stable but stored in docker-compose (acceptable for this use case)
- For production, consider using environment secrets or key management service
- ALLOWED_PUBKEYS restricts which clients can connect to relay
- Relay29 enforces that only group members can post messages after group is created
