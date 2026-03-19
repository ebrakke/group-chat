package auth

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const transferTokenDuration = 5 * time.Minute

func (s *Service) CreateTransferToken(userID int64) (string, error) {
	s.db.Exec("DELETE FROM transfer_tokens WHERE user_id = ?", userID)
	s.db.Exec("DELETE FROM transfer_tokens WHERE expires_at < ?", time.Now().UTC().Format(time.RFC3339))

	token, err := randomHex(32)
	if err != nil {
		return "", fmt.Errorf("generate transfer token: %w", err)
	}

	expiresAt := time.Now().Add(transferTokenDuration).UTC().Format(time.RFC3339)
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = s.db.Exec(
		"INSERT INTO transfer_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
		userID, token, expiresAt, now,
	)
	if err != nil {
		return "", fmt.Errorf("insert transfer token: %w", err)
	}

	return token, nil
}

func (s *Service) ValidateTransferToken(token string) (int64, error) {
	var userID int64
	var expiresAt string

	err := s.db.QueryRow(
		"SELECT user_id, expires_at FROM transfer_tokens WHERE token = ?",
		token,
	).Scan(&userID, &expiresAt)

	if errors.Is(err, sql.ErrNoRows) {
		return 0, errors.New("invalid or expired transfer token")
	}
	if err != nil {
		return 0, fmt.Errorf("query transfer token: %w", err)
	}

	// Always delete the token (single use)
	s.db.Exec("DELETE FROM transfer_tokens WHERE token = ?", token)

	// Check expiration
	expires, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil || time.Now().After(expires) {
		return 0, errors.New("invalid or expired transfer token")
	}

	// Verify user still exists
	var exists int
	s.db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", userID).Scan(&exists)
	if exists == 0 {
		return 0, errors.New("invalid or expired transfer token")
	}

	return userID, nil
}

// CreateSessionForUser creates a new session for the given user ID.
func (s *Service) CreateSessionForUser(userID int64) (string, error) {
	return s.createSession(userID)
}
