package auth

import (
	"testing"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTransferTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func bootstrapTestUser(t *testing.T, svc *Service) *User {
	t.Helper()
	user, _, err := svc.Bootstrap("testadmin", "password123", "Test Admin")
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	return user
}

func TestCreateTransferToken(t *testing.T) {
	svc := NewService(setupTransferTestDB(t))
	user := bootstrapTestUser(t, svc)

	token, err := svc.CreateTransferToken(user.ID)
	if err != nil {
		t.Fatalf("CreateTransferToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if len(token) != 64 {
		t.Fatalf("expected 64 char token, got %d", len(token))
	}
}

func TestCreateTransferToken_CleansUpOldTokens(t *testing.T) {
	svc := NewService(setupTransferTestDB(t))
	user := bootstrapTestUser(t, svc)

	token1, _ := svc.CreateTransferToken(user.ID)
	token2, _ := svc.CreateTransferToken(user.ID)

	if token1 == token2 {
		t.Fatal("expected different tokens")
	}

	_, err := svc.ValidateTransferToken(token1)
	if err == nil {
		t.Fatal("expected first token to be invalid after generating second")
	}
}

func TestValidateTransferToken(t *testing.T) {
	svc := NewService(setupTransferTestDB(t))
	user := bootstrapTestUser(t, svc)

	token, _ := svc.CreateTransferToken(user.ID)

	userID, err := svc.ValidateTransferToken(token)
	if err != nil {
		t.Fatalf("ValidateTransferToken: %v", err)
	}
	if userID != user.ID {
		t.Fatalf("expected user ID %d, got %d", user.ID, userID)
	}

	_, err = svc.ValidateTransferToken(token)
	if err == nil {
		t.Fatal("expected error on second use of token")
	}
}

func TestValidateTransferToken_Expired(t *testing.T) {
	svc := NewService(setupTransferTestDB(t))
	user := bootstrapTestUser(t, svc)

	expiredAt := time.Now().Add(-1 * time.Minute).UTC().Format(time.RFC3339)
	svc.db.Exec(
		"INSERT INTO transfer_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
		user.ID, "expiredtoken", expiredAt, time.Now().UTC().Format(time.RFC3339),
	)

	_, err := svc.ValidateTransferToken("expiredtoken")
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidateTransferToken_InvalidToken(t *testing.T) {
	svc := NewService(setupTransferTestDB(t))

	_, err := svc.ValidateTransferToken("nonexistent")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
