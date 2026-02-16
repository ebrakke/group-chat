// Package bots handles bot identity, token auth, and channel bindings.
package bots

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"

	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/db"
)

var (
	ErrNotFound = errors.New("bot not found")
	ErrExists   = errors.New("username already exists")
)

type Bot struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	CreatedAt   string `json:"createdAt"`
}

type BotToken struct {
	ID        int64   `json:"id"`
	BotID     int64   `json:"botId"`
	Label     string  `json:"label"`
	Token     string  `json:"token,omitempty"` // only populated on creation
	CreatedAt string  `json:"createdAt"`
	RevokedAt *string `json:"revokedAt,omitempty"`
}

type ChannelBinding struct {
	ID        int64  `json:"id"`
	BotID     int64  `json:"botId"`
	ChannelID int64  `json:"channelId"`
	CanRead   bool   `json:"canRead"`
	CanWrite  bool   `json:"canWrite"`
	CreatedAt string `json:"createdAt"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// Create creates a new bot user.
func (s *Service) Create(username, displayName string) (*Bot, error) {
	res, err := s.db.Exec(
		"INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, '', 'bot')",
		username, displayName,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrExists
		}
		return nil, err
	}

	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// List returns all bot users.
func (s *Service) List() ([]Bot, error) {
	rows, err := s.db.Query("SELECT id, username, display_name, created_at FROM users WHERE role = 'bot' ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bots []Bot
	for rows.Next() {
		var b Bot
		if err := rows.Scan(&b.ID, &b.Username, &b.DisplayName, &b.CreatedAt); err != nil {
			return nil, err
		}
		bots = append(bots, b)
	}
	return bots, rows.Err()
}

// GetByID returns a bot by user ID.
func (s *Service) GetByID(id int64) (*Bot, error) {
	var b Bot
	err := s.db.QueryRow(
		"SELECT id, username, display_name, created_at FROM users WHERE id = ? AND role = 'bot'", id,
	).Scan(&b.ID, &b.Username, &b.DisplayName, &b.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &b, err
}

// Delete removes a bot and cascades to tokens and bindings.
func (s *Service) Delete(id int64) error {
	res, err := s.db.Exec("DELETE FROM users WHERE id = ? AND role = 'bot'", id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GenerateToken creates a new API token for a bot. The plaintext token is returned once.
func (s *Service) GenerateToken(botID int64, label string) (*BotToken, error) {
	// Verify bot exists
	if _, err := s.GetByID(botID); err != nil {
		return nil, err
	}

	token, err := randomHex(32) // 64-char hex
	if err != nil {
		return nil, err
	}

	res, err := s.db.Exec(
		"INSERT INTO bot_tokens (bot_id, token, label) VALUES (?, ?, ?)",
		botID, token, label,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	bt := &BotToken{ID: id, BotID: botID, Label: label, Token: token}
	// Fetch created_at
	s.db.QueryRow("SELECT created_at FROM bot_tokens WHERE id = ?", id).Scan(&bt.CreatedAt)
	return bt, nil
}

// ValidateToken checks a bot token and returns the bot as an auth.User.
func (s *Service) ValidateToken(token string) (*auth.User, error) {
	var u auth.User
	err := s.db.QueryRow(`
		SELECT u.id, u.username, u.display_name, u.role, u.created_at
		FROM bot_tokens bt
		JOIN users u ON bt.bot_id = u.id
		WHERE bt.token = ? AND bt.revoked_at IS NULL AND u.role = 'bot'
	`, token).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, auth.ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	u.IsBot = true
	return &u, nil
}

// ListTokens returns all tokens for a bot (without the token value).
func (s *Service) ListTokens(botID int64) ([]BotToken, error) {
	rows, err := s.db.Query(
		"SELECT id, bot_id, label, created_at, revoked_at FROM bot_tokens WHERE bot_id = ? ORDER BY created_at DESC",
		botID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []BotToken
	for rows.Next() {
		var t BotToken
		if err := rows.Scan(&t.ID, &t.BotID, &t.Label, &t.CreatedAt, &t.RevokedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// RevokeToken revokes a bot token by ID.
func (s *Service) RevokeToken(tokenID int64) error {
	res, err := s.db.Exec("UPDATE bot_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL", tokenID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// BindChannel binds a bot to a channel with read/write scopes.
func (s *Service) BindChannel(botID, channelID int64, canRead, canWrite bool) (*ChannelBinding, error) {
	if _, err := s.GetByID(botID); err != nil {
		return nil, err
	}

	_, err := s.db.Exec(`
		INSERT INTO bot_channel_bindings (bot_id, channel_id, can_read, can_write)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(bot_id, channel_id) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write
	`, botID, channelID, canRead, canWrite)
	if err != nil {
		return nil, err
	}

	var b ChannelBinding
	err = s.db.QueryRow(`
		SELECT id, bot_id, channel_id, can_read, can_write, created_at
		FROM bot_channel_bindings WHERE bot_id = ? AND channel_id = ?
	`, botID, channelID).Scan(&b.ID, &b.BotID, &b.ChannelID, &b.CanRead, &b.CanWrite, &b.CreatedAt)
	return &b, err
}

// UnbindChannel removes a bot's binding to a channel.
func (s *Service) UnbindChannel(botID, channelID int64) error {
	res, err := s.db.Exec("DELETE FROM bot_channel_bindings WHERE bot_id = ? AND channel_id = ?", botID, channelID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListBindings returns all channel bindings for a bot.
func (s *Service) ListBindings(botID int64) ([]ChannelBinding, error) {
	rows, err := s.db.Query(
		"SELECT id, bot_id, channel_id, can_read, can_write, created_at FROM bot_channel_bindings WHERE bot_id = ? ORDER BY created_at",
		botID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bindings []ChannelBinding
	for rows.Next() {
		var b ChannelBinding
		if err := rows.Scan(&b.ID, &b.BotID, &b.ChannelID, &b.CanRead, &b.CanWrite, &b.CreatedAt); err != nil {
			return nil, err
		}
		bindings = append(bindings, b)
	}
	return bindings, rows.Err()
}

// GetBoundChannelIDs returns channel IDs where the bot has read access.
func (s *Service) GetBoundChannelIDs(botID int64) ([]int64, error) {
	rows, err := s.db.Query("SELECT channel_id FROM bot_channel_bindings WHERE bot_id = ? AND can_read = 1", botID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CanWrite checks if a bot has write access to a channel.
func (s *Service) CanWrite(botID, channelID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM bot_channel_bindings WHERE bot_id = ? AND channel_id = ? AND can_write = 1",
		botID, channelID,
	).Scan(&count)
	return count > 0, err
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "UNIQUE constraint failed") || contains(err.Error(), "unique"))
}

func contains(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
