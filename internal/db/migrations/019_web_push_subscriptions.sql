-- Replace ntfy push_subscriptions with web push subscriptions
DROP TABLE IF EXISTS push_subscriptions;

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(endpoint, p256dh_key, auth_key)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subs_user ON web_push_subscriptions(user_id);

-- Remove ntfy app setting
DELETE FROM app_settings WHERE key = 'ntfy_server_url';
