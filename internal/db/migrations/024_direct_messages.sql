-- 024_direct_messages.sql
ALTER TABLE channels ADD COLUMN is_dm BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE dm_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_dm_conversations_user1 ON dm_conversations(user1_id);
CREATE INDEX idx_dm_conversations_user2 ON dm_conversations(user2_id);
CREATE INDEX idx_dm_conversations_channel ON dm_conversations(channel_id);
