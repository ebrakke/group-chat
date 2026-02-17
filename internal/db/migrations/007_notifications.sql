-- User notification settings
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    base_url TEXT NOT NULL,
    notify_mentions BOOLEAN DEFAULT 1,
    notify_thread_replies BOOLEAN DEFAULT 1,
    notify_all_messages BOOLEAN DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Thread mutes
CREATE TABLE thread_mutes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, message_id)
);

-- Indexes
CREATE INDEX idx_thread_mutes_user_id ON thread_mutes(user_id);
CREATE INDEX idx_thread_mutes_message_id ON thread_mutes(message_id);
