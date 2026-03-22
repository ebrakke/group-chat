package dms

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

// createUser inserts a test user and returns their ID.
func createUser(t *testing.T, d *db.DB, username string) int64 {
	t.Helper()
	res, err := d.Exec(
		"INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
		username, username, "hash", "member",
	)
	if err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestGetOrCreateConversation(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")
	bobID := createUser(t, d, "bob")

	// Create new conversation
	conv, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate: %v", err)
	}
	if conv.ID == 0 {
		t.Error("expected non-zero conversation ID")
	}
	if conv.ChannelID == 0 {
		t.Error("expected non-zero channel ID")
	}
	// Canonical ordering: lower ID first
	if conv.User1ID > conv.User2ID {
		t.Errorf("expected user1_id <= user2_id, got %d and %d", conv.User1ID, conv.User2ID)
	}

	// Idempotent — same pair returns same conversation
	conv2, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate idempotent: %v", err)
	}
	if conv2.ID != conv.ID {
		t.Errorf("expected same conversation ID %d, got %d", conv.ID, conv2.ID)
	}

	// Reversed order — same result
	conv3, err := svc.GetOrCreate(bobID, aliceID)
	if err != nil {
		t.Fatalf("GetOrCreate reversed: %v", err)
	}
	if conv3.ID != conv.ID {
		t.Errorf("expected same conversation ID %d for reversed order, got %d", conv.ID, conv3.ID)
	}
}

func TestGetOrCreateSelfDM(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")

	_, err := svc.GetOrCreate(aliceID, aliceID)
	if err != ErrSelfDM {
		t.Errorf("expected ErrSelfDM, got %v", err)
	}
}

func TestListForUser(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")
	bobID := createUser(t, d, "bob")
	carolID := createUser(t, d, "carol")

	// Alice has two conversations: with bob and carol
	_, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate alice-bob: %v", err)
	}
	_, err = svc.GetOrCreate(aliceID, carolID)
	if err != nil {
		t.Fatalf("GetOrCreate alice-carol: %v", err)
	}

	aliceConvs, err := svc.ListForUser(aliceID)
	if err != nil {
		t.Fatalf("ListForUser alice: %v", err)
	}
	if len(aliceConvs) != 2 {
		t.Errorf("alice: expected 2 conversations, got %d", len(aliceConvs))
	}

	// Bob has one conversation: with alice
	bobConvs, err := svc.ListForUser(bobID)
	if err != nil {
		t.Fatalf("ListForUser bob: %v", err)
	}
	if len(bobConvs) != 1 {
		t.Errorf("bob: expected 1 conversation, got %d", len(bobConvs))
	}
	if bobConvs[0].OtherUsername != "alice" {
		t.Errorf("bob's other user: expected alice, got %q", bobConvs[0].OtherUsername)
	}
}

func TestIsParticipant(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")
	bobID := createUser(t, d, "bob")
	carolID := createUser(t, d, "carol")

	conv, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate: %v", err)
	}

	if !svc.IsParticipant(conv.ChannelID, aliceID) {
		t.Error("expected alice to be a participant")
	}
	if !svc.IsParticipant(conv.ChannelID, bobID) {
		t.Error("expected bob to be a participant")
	}
	if svc.IsParticipant(conv.ChannelID, carolID) {
		t.Error("expected carol NOT to be a participant")
	}
}

func TestIsDMChannel(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")
	bobID := createUser(t, d, "bob")

	conv, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate: %v", err)
	}

	if !svc.IsDMChannel(conv.ChannelID) {
		t.Error("expected DM channel to return true")
	}
	if svc.IsDMChannel(9999) {
		t.Error("expected nonexistent channel to return false")
	}
}

func TestGetByID(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	aliceID := createUser(t, d, "alice")
	bobID := createUser(t, d, "bob")

	conv, err := svc.GetOrCreate(aliceID, bobID)
	if err != nil {
		t.Fatalf("GetOrCreate: %v", err)
	}

	// Found
	found, err := svc.GetByID(conv.ID)
	if err != nil {
		t.Fatalf("GetByID found: %v", err)
	}
	if found.ID != conv.ID {
		t.Errorf("expected ID %d, got %d", conv.ID, found.ID)
	}

	// Not found
	_, err = svc.GetByID(9999)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
