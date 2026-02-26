// Package auth handles user authentication, sessions, and invites.
package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
	"golang.org/x/crypto/argon2"
)

var (
	ErrUserExists      = errors.New("username already exists")
	ErrInvalidLogin    = errors.New("invalid username or password")
	ErrInvalidInvite   = errors.New("invalid or expired invite code")
	ErrNotFound        = errors.New("not found")
	ErrUnauthorized    = errors.New("unauthorized")
	ErrInviteRequired  = errors.New("invite code required")
)

const sessionDuration = 30 * 24 * time.Hour // 30 days

type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	CreatedAt   string `json:"createdAt"`
	IsBot       bool   `json:"isBot,omitempty"`
}

type Invite struct {
	ID        int64   `json:"id"`
	Code      string  `json:"code"`
	CreatedBy int64   `json:"createdBy"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
	MaxUses   *int    `json:"maxUses,omitempty"`
	UseCount  int     `json:"useCount"`
	CreatedAt string  `json:"createdAt"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// HasUsers returns true if any user exists in the database.
func (s *Service) HasUsers() (bool, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count > 0, err
}

// Bootstrap creates the first admin user. Only works if no users exist.
func (s *Service) Bootstrap(username, password, displayName string) (*User, string, error) {
	has, err := s.HasUsers()
	if err != nil {
		return nil, "", err
	}
	if has {
		return nil, "", errors.New("users already exist; bootstrap not allowed")
	}
	return s.createUser(username, password, displayName, "admin")
}

// ResetPasswordByUsername resets a user's password by username (for CLI use).
func (s *Service) ResetPasswordByUsername(username, newPassword string) error {
	hash := hashPassword(newPassword)
	result, err := s.db.Exec(
		"UPDATE users SET password_hash = ? WHERE username = ?",
		hash, username,
	)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("user '%s' not found", username)
	}
	return nil
}

// Signup creates a new member user with a valid invite code.
func (s *Service) Signup(username, password, displayName, inviteCode string) (*User, string, error) {
	if inviteCode == "" {
		return nil, "", ErrInviteRequired
	}
	if err := s.consumeInvite(inviteCode); err != nil {
		return nil, "", err
	}
	return s.createUser(username, password, displayName, "member")
}

// Login authenticates a user and returns a session token.
func (s *Service) Login(username, password string) (*User, string, error) {
	var id int64
	var hash, displayName, role, createdAt string
	err := s.db.QueryRow(
		"SELECT id, password_hash, display_name, role, created_at FROM users WHERE username = ?",
		username,
	).Scan(&id, &hash, &displayName, &role, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrInvalidLogin
	}
	if err != nil {
		return nil, "", err
	}

	if !verifyPassword(password, hash) {
		return nil, "", ErrInvalidLogin
	}

	token, err := s.createSession(id)
	if err != nil {
		return nil, "", err
	}

	return &User{ID: id, Username: username, DisplayName: displayName, Role: role, CreatedAt: createdAt, IsBot: role == "bot"}, token, nil
}

// ValidateSession returns the user for a valid session token.
func (s *Service) ValidateSession(token string) (*User, error) {
	var u User
	err := s.db.QueryRow(`
		SELECT u.id, u.username, u.display_name, u.role, u.created_at
		FROM sessions s JOIN users u ON s.user_id = u.id
		WHERE s.token = ? AND s.expires_at > datetime('now')
	`, token).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	u.IsBot = u.Role == "bot"
	return &u, nil
}

// Logout deletes a session.
func (s *Service) Logout(token string) error {
	_, err := s.db.Exec("DELETE FROM sessions WHERE token = ?", token)
	return err
}

// CreateInvite creates a new invite code. Only admins should call this.
func (s *Service) CreateInvite(createdBy int64, expiresAt *time.Time, maxUses *int) (*Invite, error) {
	code, err := randomHex(16)
	if err != nil {
		return nil, err
	}

	var expStr *string
	if expiresAt != nil {
		s := expiresAt.UTC().Format(time.RFC3339)
		expStr = &s
	}

	res, err := s.db.Exec(
		"INSERT INTO invites (code, created_by, expires_at, max_uses) VALUES (?, ?, ?, ?)",
		code, createdBy, expStr, maxUses,
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	return &Invite{
		ID:        id,
		Code:      code,
		CreatedBy: createdBy,
		ExpiresAt: expStr,
		MaxUses:   maxUses,
		UseCount:  0,
	}, nil
}

// ListInvites returns all invite codes.
func (s *Service) ListInvites() ([]Invite, error) {
	rows, err := s.db.Query("SELECT id, code, created_by, expires_at, max_uses, use_count, created_at FROM invites ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []Invite
	for rows.Next() {
		var inv Invite
		if err := rows.Scan(&inv.ID, &inv.Code, &inv.CreatedBy, &inv.ExpiresAt, &inv.MaxUses, &inv.UseCount, &inv.CreatedAt); err != nil {
			return nil, err
		}
		invites = append(invites, inv)
	}
	return invites, rows.Err()
}

// ResetPassword allows admin to reset any user's password.
func (s *Service) ResetPassword(userID int64, newPassword string) error {
	hash := hashPassword(newPassword)
	_, err := s.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", hash, userID)
	return err
}

// ChangePassword verifies the current password and updates to a new one.
func (s *Service) ChangePassword(userID int64, currentPassword, newPassword string) error {
	var hash string
	err := s.db.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&hash)
	if err != nil {
		return err
	}
	if !verifyPassword(currentPassword, hash) {
		return ErrInvalidLogin
	}
	newHash := hashPassword(newPassword)
	_, err = s.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", newHash, userID)
	return err
}

// GetUserByID returns a user by ID.
func (s *Service) GetUserByID(id int64) (*User, error) {
	var u User
	err := s.db.QueryRow("SELECT id, username, display_name, role, created_at FROM users WHERE id = ?", id).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	u.IsBot = u.Role == "bot"
	return &u, nil
}

// SearchUsers returns users whose username or display_name matches the given prefix.
func (s *Service) SearchUsers(query string) ([]User, error) {
	like := query + "%"
	rows, err := s.db.Query(
		"SELECT id, username, display_name, role, created_at FROM users WHERE username LIKE ? OR display_name LIKE ? ORDER BY username LIMIT 10",
		like, like,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.IsBot = u.Role == "bot"
		users = append(users, u)
	}
	return users, rows.Err()
}

// ListUsers returns all users.
func (s *Service) ListUsers() ([]User, error) {
	rows, err := s.db.Query("SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.IsBot = u.Role == "bot"
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Service) createUser(username, password, displayName, role string) (*User, string, error) {
	hash := hashPassword(password)

	res, err := s.db.Exec(
		"INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		username, displayName, hash, role,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, "", ErrUserExists
		}
		return nil, "", err
	}

	id, _ := res.LastInsertId()
	token, err := s.createSession(id)
	if err != nil {
		return nil, "", err
	}

	return &User{ID: id, Username: username, DisplayName: displayName, Role: role, IsBot: role == "bot"}, token, nil
}

func (s *Service) createSession(userID int64) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}

	expires := time.Now().Add(sessionDuration)
	_, err = s.db.Exec(
		"INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
		userID, token, expires.UTC().Format(time.RFC3339),
	)
	return token, err
}

func (s *Service) consumeInvite(code string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var id int64
	var expiresAt *string
	var maxUses *int
	var useCount int
	err = tx.QueryRow(
		"SELECT id, expires_at, max_uses, use_count FROM invites WHERE code = ?", code,
	).Scan(&id, &expiresAt, &maxUses, &useCount)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrInvalidInvite
	}
	if err != nil {
		return err
	}

	if expiresAt != nil {
		t, _ := time.Parse(time.RFC3339, *expiresAt)
		if time.Now().After(t) {
			return ErrInvalidInvite
		}
	}
	if maxUses != nil && useCount >= *maxUses {
		return ErrInvalidInvite
	}

	_, err = tx.Exec("UPDATE invites SET use_count = use_count + 1 WHERE id = ?", id)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// argon2id password hashing
func hashPassword(password string) string {
	salt := make([]byte, 16)
	rand.Read(salt)
	hash := argon2.IDKey([]byte(password), salt, 2, 64*1024, 4, 32)
	return fmt.Sprintf("%x$%x", salt, hash)
}

func verifyPassword(password, stored string) bool {
	parts := splitOnce(stored, "$")
	if len(parts) != 2 {
		return false
	}
	salt, _ := hex.DecodeString(parts[0])
	expected, _ := hex.DecodeString(parts[1])
	hash := argon2.IDKey([]byte(password), salt, 2, 64*1024, 4, 32)
	if len(hash) != len(expected) {
		return false
	}
	// constant-time compare
	var diff byte
	for i := range hash {
		diff |= hash[i] ^ expected[i]
	}
	return diff == 0
}

func splitOnce(s, sep string) []string {
	i := indexOf(s, sep)
	if i < 0 {
		return []string{s}
	}
	return []string{s[:i], s[i+len(sep):]}
}

func indexOf(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
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
	return indexOf(s, sub) >= 0
}
