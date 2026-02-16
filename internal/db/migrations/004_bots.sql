-- Recreate users table to allow 'bot' role.
-- SQLite cannot ALTER CHECK constraints, so we recreate the table.
CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'bot')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_new (id, username, display_name, password_hash, role, created_at)
    SELECT id, username, display_name, password_hash, role, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Bot tokens for API/WebSocket authentication
CREATE TABLE bot_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME
);

CREATE INDEX idx_bot_tokens_token ON bot_tokens(token);
CREATE INDEX idx_bot_tokens_bot_id ON bot_tokens(bot_id);

-- Bot channel bindings (scopes: can_read, can_write)
CREATE TABLE bot_channel_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    can_read BOOLEAN NOT NULL DEFAULT 1,
    can_write BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_id, channel_id)
);

CREATE INDEX idx_bot_bindings_bot ON bot_channel_bindings(bot_id);
CREATE INDEX idx_bot_bindings_channel ON bot_channel_bindings(channel_id);
