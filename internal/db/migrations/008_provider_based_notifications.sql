-- Drop old webhook-specific table
DROP TABLE IF EXISTS user_notification_settings;

-- New provider-agnostic settings table
CREATE TABLE user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'webhook',
    provider_config TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    notify_mentions INTEGER NOT NULL DEFAULT 1,
    notify_thread_replies INTEGER NOT NULL DEFAULT 1,
    notify_all_messages INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Server-wide provider configuration (admin-managed)
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Store Pushover app token here
INSERT INTO app_settings (key, value, updated_at)
VALUES ('pushover_app_token', '', datetime('now'));
