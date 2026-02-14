package auth

import (
	"path/filepath"
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestBootstrap(t *testing.T) {
	svc := NewService(setupTestDB(t))

	has, _ := svc.HasUsers()
	if has {
		t.Fatal("expected no users initially")
	}

	user, token, err := svc.Bootstrap("admin", "password123", "Admin User")
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	if user.Username != "admin" {
		t.Errorf("username = %q, want admin", user.Username)
	}
	if user.Role != "admin" {
		t.Errorf("role = %q, want admin", user.Role)
	}
	if user.DisplayName != "Admin User" {
		t.Errorf("displayName = %q, want Admin User", user.DisplayName)
	}
	if token == "" {
		t.Error("expected non-empty token")
	}

	has, _ = svc.HasUsers()
	if !has {
		t.Fatal("expected users after bootstrap")
	}

	// Second bootstrap should fail
	_, _, err = svc.Bootstrap("admin2", "pass", "Admin 2")
	if err == nil {
		t.Fatal("expected error on second bootstrap")
	}
}

func TestLogin(t *testing.T) {
	svc := NewService(setupTestDB(t))
	svc.Bootstrap("admin", "secret", "Admin")

	// Valid login
	user, token, err := svc.Login("admin", "secret")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if user.Username != "admin" {
		t.Errorf("username = %q", user.Username)
	}
	if token == "" {
		t.Error("expected token")
	}

	// Wrong password
	_, _, err = svc.Login("admin", "wrong")
	if err != ErrInvalidLogin {
		t.Errorf("expected ErrInvalidLogin, got %v", err)
	}

	// Wrong user
	_, _, err = svc.Login("nobody", "secret")
	if err != ErrInvalidLogin {
		t.Errorf("expected ErrInvalidLogin, got %v", err)
	}
}

func TestSession(t *testing.T) {
	svc := NewService(setupTestDB(t))
	_, token, _ := svc.Bootstrap("admin", "pass", "Admin")

	user, err := svc.ValidateSession(token)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if user.Username != "admin" {
		t.Errorf("username = %q", user.Username)
	}

	// Invalid token
	_, err = svc.ValidateSession("bogus")
	if err != ErrUnauthorized {
		t.Errorf("expected ErrUnauthorized, got %v", err)
	}

	// Logout
	svc.Logout(token)
	_, err = svc.ValidateSession(token)
	if err != ErrUnauthorized {
		t.Errorf("expected ErrUnauthorized after logout, got %v", err)
	}
}

func TestInviteSignup(t *testing.T) {
	svc := NewService(setupTestDB(t))
	admin, _, _ := svc.Bootstrap("admin", "pass", "Admin")

	// Create invite
	invite, err := svc.CreateInvite(admin.ID, nil, nil)
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}
	if invite.Code == "" {
		t.Fatal("expected invite code")
	}

	// Signup without invite
	_, _, err = svc.Signup("member1", "pass", "Member 1", "")
	if err != ErrInviteRequired {
		t.Errorf("expected ErrInviteRequired, got %v", err)
	}

	// Signup with bad invite
	_, _, err = svc.Signup("member1", "pass", "Member 1", "bogus")
	if err != ErrInvalidInvite {
		t.Errorf("expected ErrInvalidInvite, got %v", err)
	}

	// Signup with valid invite
	user, token, err := svc.Signup("member1", "pass", "Member 1", invite.Code)
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	if user.Role != "member" {
		t.Errorf("role = %q, want member", user.Role)
	}
	if token == "" {
		t.Error("expected token")
	}

	// Duplicate username
	invite2, _ := svc.CreateInvite(admin.ID, nil, nil)
	_, _, err = svc.Signup("member1", "pass", "Dup", invite2.Code)
	if err != ErrUserExists {
		t.Errorf("expected ErrUserExists, got %v", err)
	}
}

func TestInviteMaxUses(t *testing.T) {
	svc := NewService(setupTestDB(t))
	admin, _, _ := svc.Bootstrap("admin", "pass", "Admin")

	maxUses := 1
	invite, _ := svc.CreateInvite(admin.ID, nil, &maxUses)

	// First use OK
	_, _, err := svc.Signup("u1", "pass", "U1", invite.Code)
	if err != nil {
		t.Fatalf("first signup: %v", err)
	}

	// Second use should fail
	_, _, err = svc.Signup("u2", "pass", "U2", invite.Code)
	if err != ErrInvalidInvite {
		t.Errorf("expected ErrInvalidInvite, got %v", err)
	}
}

func TestResetPassword(t *testing.T) {
	svc := NewService(setupTestDB(t))
	admin, _, _ := svc.Bootstrap("admin", "oldpass", "Admin")

	err := svc.ResetPassword(admin.ID, "newpass")
	if err != nil {
		t.Fatalf("reset: %v", err)
	}

	// Old password fails
	_, _, err = svc.Login("admin", "oldpass")
	if err != ErrInvalidLogin {
		t.Errorf("expected ErrInvalidLogin with old pass, got %v", err)
	}

	// New password works
	_, _, err = svc.Login("admin", "newpass")
	if err != nil {
		t.Fatalf("login with new pass: %v", err)
	}
}

func TestListUsers(t *testing.T) {
	svc := NewService(setupTestDB(t))
	svc.Bootstrap("admin", "pass", "Admin")

	users, err := svc.ListUsers()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(users) != 1 {
		t.Errorf("users count = %d, want 1", len(users))
	}
}

func TestPasswordHashing(t *testing.T) {
	hash := hashPassword("test123")
	if !verifyPassword("test123", hash) {
		t.Error("password should verify")
	}
	if verifyPassword("wrong", hash) {
		t.Error("wrong password should not verify")
	}
}
