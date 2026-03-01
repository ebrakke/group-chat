-- Rename channel_members to channel_reads (purely read-state tracking, not membership)
-- Drop joined_at column since it's no longer meaningful

CREATE TABLE channel_reads (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_msg_id INTEGER DEFAULT 0,
    PRIMARY KEY (channel_id, user_id)
);

INSERT INTO channel_reads (channel_id, user_id, last_read_msg_id)
SELECT channel_id, user_id, COALESCE(last_read_msg_id, 0)
FROM channel_members;

DROP TABLE channel_members;
