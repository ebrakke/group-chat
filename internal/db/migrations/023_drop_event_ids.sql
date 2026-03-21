-- Drop Nostr event ID columns (no longer used after relay removal)
DROP INDEX IF EXISTS idx_messages_event_id;
ALTER TABLE messages DROP COLUMN event_id;
ALTER TABLE reactions DROP COLUMN event_id;
