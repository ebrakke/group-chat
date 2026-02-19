-- Backfill mentions for existing messages
-- For messages with no mentions in content, set to empty JSON array
UPDATE messages
SET mentions = '[]'
WHERE mentions IS NULL AND content NOT LIKE '%@%';

-- For messages with @ symbols, we need to extract mentions using app logic
-- This will be handled by a one-time migration in code if needed
-- For now, set to empty array and they'll get proper mentions on next message
UPDATE messages
SET mentions = '[]'
WHERE mentions IS NULL;
