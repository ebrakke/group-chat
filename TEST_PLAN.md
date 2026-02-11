# Test Plan for Messaging Fixes

## Changes Made

### 1. Stable Keypairs (Issue #1)
- ✅ Generated stable relay keypair:
  - RELAY_PRIVKEY: `25b01afc58f00f3dd3891faf32ad285143456df297f4f2540c692b3109d8d7f5`
  - RELAY_PUBKEY: `8da73e52d43685e2c727f2374c90426ddc951bb2677e1b943df531edea914364`

- ✅ Generated stable API server keypair:
  - SERVER_PRIVKEY: `27b272d8c82f77eafa45289ce75ca33be7d90d01eb5462f333d977b1ea8a2503`
  - SERVER_PUBKEY: `eb791dd5f7d08ff2831e20ef074d04daea835b68e59803c8b5fffaef816d16e6`

- ✅ Updated `docker-compose.yml` and created `docker-compose.prod.yml` with these keys
- ✅ Modified `api/src/index.ts` to read `SERVER_PRIVKEY` from environment
- ✅ API server's pubkey is added to relay's `ALLOWED_PUBKEYS`

### 2. Create Group on Relay (Issue #2)
- ✅ Modified `initDefaultChannel()` in `api/src/index.ts` to:
  1. Call `nostrClient.createGroup('general', serverPrivkey)` first
  2. Then call `nostrClient.updateChannelMetadata()` to set metadata
  3. Added proper error handling and logging

### 3. Relay29 Authorization (Issue #3)
- ✅ Verified that relay29 allows ANY authenticated client to create groups by default
- ✅ No additional configuration needed for group creation authorization
- ✅ Once a group exists, only members (or relay's own pubkey) can write to it

## Testing Steps

1. **Clean start:**
   ```bash
   cd /root/.openclaw/workspace-acid_burn/relay-chat
   docker compose down -v
   docker compose up --build
   ```

2. **Verify relay startup:**
   ```bash
   docker compose logs relay
   ```
   Should see:
   - "Relay starting on :3334"
   - Pubkey should be: `8da73e52d43685e2c727f2374c90426ddc951bb2677e1b943df531edea914364`

3. **Verify API startup:**
   ```bash
   docker compose logs api
   ```
   Should see:
   - "Server Nostr pubkey: eb791dd5f7d08ff2831e20ef074d04daea835b68e59803c8b5fffaef816d16e6"
   - "Connected to Nostr relay"
   - "Creating #general group on relay..."
   - "Created #general group successfully"
   - "Publishing #general channel metadata..."
   - "Published #general channel metadata successfully"

4. **Test message posting:**
   ```bash
   # First, create a user account (or use existing invite system)
   # Then post a message:
   curl -X POST http://localhost:4000/api/v1/channels/general/messages \
     -H "Content-Type: application/json" \
     -H "Cookie: session=..." \
     -d '{"content": "Test message"}'
   ```
   Should return HTTP 200 with the message data.

5. **Verify message on relay:**
   Check relay logs for kind 9 events (group messages) being published to the 'general' group.

## Expected Results

- ✅ Relay and API use same keypairs across restarts
- ✅ #general group is created on relay at startup
- ✅ Messages can be successfully posted to #general channel
- ✅ No "group doesn't exist" errors

## Known Issues

- None expected with these fixes

## Rollback Plan

If issues occur:
1. Revert to previous commit: `git reset --hard HEAD~1`
2. Rebuild: `docker compose down -v && docker compose up --build`
