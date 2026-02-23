-- Push notification subscriptions (ntfy.sh topics per user)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ntfy_topic TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Seed ntfy server URL setting (replaces pushover_app_token)
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('ntfy_server_url', '', datetime('now'));
