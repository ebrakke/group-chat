-- Add ntfy topic column to users table
ALTER TABLE users ADD COLUMN ntfy_topic TEXT;

-- Add ntfy settings to app_settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_server_url', 'https://ntfy.sh');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ntfy_publish_token', '');
