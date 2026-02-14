CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    event_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_channel_toplevel ON messages(channel_id, created_at)
    WHERE parent_id IS NULL;
CREATE INDEX idx_messages_parent ON messages(parent_id, created_at)
    WHERE parent_id IS NOT NULL;
CREATE INDEX idx_messages_event_id ON messages(event_id);
