CREATE TABLE IF NOT EXISTS channel_notification_settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'mentions',
    PRIMARY KEY (user_id, channel_id)
);
