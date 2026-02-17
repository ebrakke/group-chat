package notifications

import (
	"testing"

	"github.com/ebrakke/relay-chat/internal/db"
)

func TestNewService(t *testing.T) {
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer database.Close()

	svc := NewService(database)
	if svc == nil {
		t.Fatal("NewService returned nil")
	}
	if svc.db == nil {
		t.Fatal("service db is nil")
	}
}
