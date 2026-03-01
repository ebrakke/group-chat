package messages

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

	// Create test user and channel
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('alice', 'Alice', 'hash', 'admin')")
	d.Exec("INSERT INTO users (username, display_name, password_hash, role) VALUES ('bob', 'Bob', 'hash', 'member')")
	d.Exec("INSERT INTO channels (name) VALUES ('general')")
	return d
}

func TestCreateAndGetMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, err := svc.Create(1, 1, "Hello world", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if msg.Content != "Hello world" {
		t.Errorf("content = %q", msg.Content)
	}
	if msg.Username != "alice" {
		t.Errorf("username = %q", msg.Username)
	}
	if msg.DisplayName != "Alice" {
		t.Errorf("displayName = %q", msg.DisplayName)
	}
	if msg.ParentID != nil {
		t.Errorf("parentId should be nil")
	}
	if msg.EventID == "" {
		t.Errorf("eventId should not be empty")
	}

	// GetByID
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.Content != "Hello world" {
		t.Errorf("content = %q", got.Content)
	}
}

func TestCreateReply(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	parent, err := svc.Create(1, 1, "Parent message", "general")
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}

	reply, err := svc.CreateReply(parent.ID, 2, "Reply from bob", "general")
	if err != nil {
		t.Fatalf("create reply: %v", err)
	}
	if reply.ParentID == nil || *reply.ParentID != parent.ID {
		t.Errorf("parentId = %v, want %d", reply.ParentID, parent.ID)
	}
	if reply.Username != "bob" {
		t.Errorf("username = %q", reply.Username)
	}
	if reply.ChannelID != parent.ChannelID {
		t.Errorf("channelId = %d, want %d", reply.ChannelID, parent.ChannelID)
	}
}

func TestCannotReplyToReply(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	parent, _ := svc.Create(1, 1, "Parent", "general")
	reply, _ := svc.CreateReply(parent.ID, 2, "Reply", "general")

	_, err := svc.CreateReply(reply.ID, 1, "Nested reply", "general")
	if err == nil {
		t.Fatal("expected error when replying to a reply")
	}
}

func TestListChannelMessages(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Create messages
	svc.Create(1, 1, "msg1", "general")
	svc.Create(1, 2, "msg2", "general")
	parent, _ := svc.Create(1, 1, "msg3", "general")
	// Create a reply (should NOT appear in channel list)
	svc.CreateReply(parent.ID, 2, "reply1", "general")

	msgs, err := svc.ListChannel(1, 50, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("count = %d, want 3", len(msgs))
	}
	// Newest first
	if msgs[0].Content != "msg3" {
		t.Errorf("first = %q, want msg3", msgs[0].Content)
	}
	// msg3 should have reply_count=1
	if msgs[0].ReplyCount != 1 {
		t.Errorf("replyCount = %d, want 1", msgs[0].ReplyCount)
	}
}

func TestListChannelPagination(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	svc.Create(1, 1, "msg1", "general")
	svc.Create(1, 1, "msg2", "general")
	msg3, _ := svc.Create(1, 1, "msg3", "general")

	// Get messages before msg3
	msgs, err := svc.ListChannel(1, 50, msg3.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("count = %d, want 2", len(msgs))
	}
}

func TestListThread(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	parent, _ := svc.Create(1, 1, "Parent", "general")
	svc.CreateReply(parent.ID, 2, "reply1", "general")
	svc.CreateReply(parent.ID, 1, "reply2", "general")

	replies, err := svc.ListThread(parent.ID, 50, 0)
	if err != nil {
		t.Fatalf("list thread: %v", err)
	}
	if len(replies) != 2 {
		t.Fatalf("count = %d, want 2", len(replies))
	}
	// Oldest first
	if replies[0].Content != "reply1" {
		t.Errorf("first = %q, want reply1", replies[0].Content)
	}
}

func TestGetByIDNotFound(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	_, err := svc.GetByID(999)
	if err != ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestExtractURLs(t *testing.T) {
	tests := []struct {
		content string
		want    []string
	}{
		{"no links here", nil},
		{"check https://example.com out", []string{"https://example.com"}},
		{"http://a.com and https://b.com/path?q=1", []string{"http://a.com", "https://b.com/path?q=1"}},
		{"https://a.com https://b.com https://c.com https://d.com", []string{"https://a.com", "https://b.com", "https://c.com"}}, // max 3
		{"no trailing punc https://example.com.", []string{"https://example.com"}},
		{"parens (https://example.com)", []string{"https://example.com"}},
	}
	for _, tt := range tests {
		got := extractURLs(tt.content)
		if len(got) != len(tt.want) {
			t.Errorf("extractURLs(%q) = %v, want %v", tt.content, got, tt.want)
			continue
		}
		for i := range got {
			if got[i] != tt.want[i] {
				t.Errorf("extractURLs(%q)[%d] = %q, want %q", tt.content, i, got[i], tt.want[i])
			}
		}
	}
}

func TestMessageLinkPreviews(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Message with no URLs — linkPreviews should be nil
	msg, err := svc.Create(1, 1, "no links here", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if msg.LinkPreviews != nil {
		t.Errorf("expected nil linkPreviews, got %v", msg.LinkPreviews)
	}

	// Verify link_previews column is readable (NULL case)
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.LinkPreviews != nil {
		t.Errorf("expected nil linkPreviews from GetByID, got %v", got.LinkPreviews)
	}
}

func TestEditMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, err := svc.Create(1, 1, "original content", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if msg.EditedAt != nil {
		t.Error("editedAt should be nil on new message")
	}

	edited, err := svc.Edit(msg.ID, 1, "updated content")
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if edited.Content != "updated content" {
		t.Errorf("content = %q, want %q", edited.Content, "updated content")
	}
	if edited.EditedAt == nil {
		t.Error("editedAt should be set after edit")
	}

	// Verify via GetByID
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.Content != "updated content" {
		t.Errorf("content = %q, want %q", got.Content, "updated content")
	}
	if got.EditedAt == nil {
		t.Error("editedAt should be set after edit (via GetByID)")
	}
}

func TestEditMessageWrongUser(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, err := svc.Create(1, 1, "alice's message", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Bob (user 2) tries to edit Alice's (user 1) message
	_, err = svc.Edit(msg.ID, 2, "hacked")
	if err != ErrForbidden {
		t.Errorf("err = %v, want ErrForbidden", err)
	}

	// Verify content unchanged
	got, _ := svc.GetByID(msg.ID)
	if got.Content != "alice's message" {
		t.Errorf("content = %q, want %q", got.Content, "alice's message")
	}
}

func TestDeleteMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, err := svc.Create(1, 1, "to be deleted", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Owner deletes
	err = svc.Delete(msg.ID, 1, false)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	// Verify deletedAt is set
	got, err := svc.GetByID(msg.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.DeletedAt == nil {
		t.Error("deletedAt should be set after delete")
	}
}

func TestDeleteMessageAdmin(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Bob (user 2, member) creates a message
	msg, err := svc.Create(1, 2, "bob's message", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Alice (user 1, admin) deletes it with isAdmin=true
	err = svc.Delete(msg.ID, 1, true)
	if err != nil {
		t.Fatalf("admin delete: %v", err)
	}

	got, _ := svc.GetByID(msg.ID)
	if got.DeletedAt == nil {
		t.Error("deletedAt should be set after admin delete")
	}
}

func TestDeleteMessageWrongUser(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Alice (user 1) creates a message
	msg, err := svc.Create(1, 1, "alice's message", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Bob (user 2, not admin) tries to delete
	err = svc.Delete(msg.ID, 2, false)
	if err != ErrForbidden {
		t.Errorf("err = %v, want ErrForbidden", err)
	}

	// Verify message not deleted
	got, _ := svc.GetByID(msg.ID)
	if got.DeletedAt != nil {
		t.Error("deletedAt should be nil for unauthorized delete")
	}
}

func TestDeletedMessagesExcludedFromList(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	svc.Create(1, 1, "msg1", "general")
	msg2, _ := svc.Create(1, 1, "msg2", "general")
	svc.Create(1, 1, "msg3", "general")

	// Delete msg2
	svc.Delete(msg2.ID, 1, false)

	msgs, err := svc.ListChannel(1, 50, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("count = %d, want 2", len(msgs))
	}
	for _, m := range msgs {
		if m.Content == "msg2" {
			t.Error("deleted message should not appear in list")
		}
	}
}

func TestEditDeletedMessage(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	msg, err := svc.Create(1, 1, "will be deleted", "general")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Delete the message
	err = svc.Delete(msg.ID, 1, false)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	// Attempt to edit the deleted message
	_, err = svc.Edit(msg.ID, 1, "trying to edit deleted")
	if err != ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestDeletedRepliesExcludedFromThread(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	parent, err := svc.Create(1, 1, "parent", "general")
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}

	reply, err := svc.CreateReply(parent.ID, 2, "reply to delete", "general")
	if err != nil {
		t.Fatalf("create reply: %v", err)
	}

	// Delete the reply
	err = svc.Delete(reply.ID, 2, false)
	if err != nil {
		t.Fatalf("delete reply: %v", err)
	}

	// ListThread should return 0 replies
	replies, err := svc.ListThread(parent.ID, 50, 0)
	if err != nil {
		t.Fatalf("list thread: %v", err)
	}
	if len(replies) != 0 {
		t.Errorf("reply count = %d, want 0", len(replies))
	}
}

func TestDeletedReplyCountExcluded(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	parent, err := svc.Create(1, 1, "parent", "general")
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}

	reply1, err := svc.CreateReply(parent.ID, 2, "reply 1", "general")
	if err != nil {
		t.Fatalf("create reply1: %v", err)
	}

	_, err = svc.CreateReply(parent.ID, 2, "reply 2", "general")
	if err != nil {
		t.Fatalf("create reply2: %v", err)
	}

	// Delete one reply
	err = svc.Delete(reply1.ID, 2, false)
	if err != nil {
		t.Fatalf("delete reply1: %v", err)
	}

	// Fetch parent via GetByID — replyCount should be 1, not 2
	got, err := svc.GetByID(parent.ID)
	if err != nil {
		t.Fatalf("getByID: %v", err)
	}
	if got.ReplyCount != 1 {
		t.Errorf("replyCount = %d, want 1", got.ReplyCount)
	}
}

func TestNostrEventTags(t *testing.T) {
	d := setupTestDB(t)
	svc := NewService(d)

	// Just verify events are created with proper IDs (non-empty 64-char hex)
	msg, _ := svc.Create(1, 1, "test", "general")
	if len(msg.EventID) != 64 {
		t.Errorf("eventId length = %d, want 64", len(msg.EventID))
	}

	reply, _ := svc.CreateReply(msg.ID, 2, "reply", "general")
	if len(reply.EventID) != 64 {
		t.Errorf("reply eventId length = %d, want 64", len(reply.EventID))
	}
}
