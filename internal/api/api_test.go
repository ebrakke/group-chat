package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/bots"
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/files"
	"github.com/ebrakke/relay-chat/internal/messages"
	"github.com/ebrakke/relay-chat/internal/notifications"
	"github.com/ebrakke/relay-chat/internal/reactions"
	"github.com/ebrakke/relay-chat/internal/ws"
)

func setup(t *testing.T) *Handler {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })

	authSvc := auth.NewService(d)
	botSvc := bots.NewService(d)
	chanSvc := channels.NewService(d)
	msgSvc := messages.NewService(d)
	reactSvc := reactions.NewService(d)
	hub := ws.NewHub()
	chanSvc.EnsureGeneral()
	notifySvc := notifications.NewService(d, "http://localhost:8080")
	uploadDir := filepath.Join(t.TempDir(), "uploads")
	fileSvc := files.NewService(d, uploadDir, 10<<20)
	return New(authSvc, botSvc, chanSvc, msgSvc, reactSvc, notifySvc, fileSvc, hub)
}

func doReq(h http.Handler, method, path string, body interface{}) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func doReqWithCookie(h http.Handler, method, path string, body interface{}, cookies []*http.Cookie) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestHealthEndpoint(t *testing.T) {
	h := setup(t)
	w := doReq(h, "GET", "/api/health", nil)
	if w.Code != 200 {
		t.Errorf("status = %d", w.Code)
	}
}

func TestHasUsersEndpoint(t *testing.T) {
	h := setup(t)
	w := doReq(h, "GET", "/api/auth/has-users", nil)
	if w.Code != 200 {
		t.Errorf("status = %d", w.Code)
	}
	var resp map[string]bool
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["hasUsers"] {
		t.Error("expected hasUsers=false")
	}
}

func TestBootstrapAndLogin(t *testing.T) {
	h := setup(t)

	// Bootstrap
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret", "displayName": "Admin",
	})
	if w.Code != 201 {
		t.Fatalf("bootstrap status = %d, body = %s", w.Code, w.Body.String())
	}

	var bootstrapResp struct {
		User  auth.User `json:"user"`
		Token string    `json:"token"`
	}
	json.Unmarshal(w.Body.Bytes(), &bootstrapResp)
	if bootstrapResp.User.Role != "admin" {
		t.Errorf("role = %q", bootstrapResp.User.Role)
	}

	// Check hasUsers now true
	w = doReq(h, "GET", "/api/auth/has-users", nil)
	var hasResp map[string]bool
	json.Unmarshal(w.Body.Bytes(), &hasResp)
	if !hasResp["hasUsers"] {
		t.Error("expected hasUsers=true after bootstrap")
	}

	// Login
	w = doReq(h, "POST", "/api/auth/login", map[string]string{
		"username": "admin", "password": "secret",
	})
	if w.Code != 200 {
		t.Fatalf("login status = %d, body = %s", w.Code, w.Body.String())
	}

	// Extract session cookie
	cookies := w.Result().Cookies()

	// /api/auth/me with cookie
	w = doReqWithCookie(h, "GET", "/api/auth/me", nil, cookies)
	if w.Code != 200 {
		t.Fatalf("me status = %d", w.Code)
	}

	// /api/auth/me without auth
	w = doReq(h, "GET", "/api/auth/me", nil)
	if w.Code != 401 {
		t.Errorf("me without auth = %d, want 401", w.Code)
	}
}

func TestInviteAndSignup(t *testing.T) {
	h := setup(t)

	// Bootstrap admin
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	cookies := w.Result().Cookies()

	// Create invite
	w = doReqWithCookie(h, "POST", "/api/invites", nil, cookies)
	if w.Code != 201 {
		t.Fatalf("create invite status = %d, body = %s", w.Code, w.Body.String())
	}
	var invite auth.Invite
	json.Unmarshal(w.Body.Bytes(), &invite)
	if invite.Code == "" {
		t.Fatal("expected invite code")
	}

	// Signup with invite
	w = doReq(h, "POST", "/api/auth/signup", map[string]string{
		"username": "member1", "password": "pass", "displayName": "Member One", "inviteCode": invite.Code,
	})
	if w.Code != 201 {
		t.Fatalf("signup status = %d, body = %s", w.Code, w.Body.String())
	}

	// Signup without invite
	w = doReq(h, "POST", "/api/auth/signup", map[string]string{
		"username": "member2", "password": "pass",
	})
	if w.Code != 400 {
		t.Errorf("signup without invite = %d, want 400", w.Code)
	}
}

func TestChannelsList(t *testing.T) {
	h := setup(t)

	// Bootstrap
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	cookies := w.Result().Cookies()

	// List channels (should include #general)
	w = doReqWithCookie(h, "GET", "/api/channels", nil, cookies)
	if w.Code != 200 {
		t.Fatalf("channels status = %d", w.Code)
	}
	var chs []channels.Channel
	json.Unmarshal(w.Body.Bytes(), &chs)
	if len(chs) == 0 {
		t.Fatal("expected at least #general")
	}
	found := false
	for _, ch := range chs {
		if ch.Name == "general" {
			found = true
		}
	}
	if !found {
		t.Error("expected #general channel")
	}
}

func TestLogout(t *testing.T) {
	h := setup(t)

	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	cookies := w.Result().Cookies()

	// Logout
	w = doReqWithCookie(h, "POST", "/api/auth/logout", nil, cookies)
	if w.Code != 200 {
		t.Fatalf("logout status = %d", w.Code)
	}

	// Me should fail now
	w = doReqWithCookie(h, "GET", "/api/auth/me", nil, cookies)
	if w.Code != 401 {
		t.Errorf("me after logout = %d, want 401", w.Code)
	}
}

func TestEditMessage(t *testing.T) {
	h := setup(t)

	// Bootstrap user
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	if w.Code != 201 {
		t.Fatalf("bootstrap status = %d, body = %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()

	// List channels to get #general ID
	w = doReqWithCookie(h, "GET", "/api/channels", nil, cookies)
	var chs []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &chs)
	if len(chs) == 0 {
		t.Fatal("no channels")
	}
	channelID := int(chs[0]["id"].(float64))

	// Create message
	w = doReqWithCookie(h, "POST", fmt.Sprintf("/api/channels/%d/messages", channelID),
		map[string]string{"content": "hello world"}, cookies)
	if w.Code != 201 {
		t.Fatalf("create message status = %d, body = %s", w.Code, w.Body.String())
	}
	var msg map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &msg)
	msgID := int(msg["id"].(float64))

	// Edit message
	w = doReqWithCookie(h, "PUT", fmt.Sprintf("/api/messages/%d", msgID),
		map[string]string{"content": "hello updated"}, cookies)
	if w.Code != 200 {
		t.Fatalf("edit message status = %d, body = %s", w.Code, w.Body.String())
	}
	var edited map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &edited)
	if edited["content"] != "hello updated" {
		t.Errorf("content = %q, want %q", edited["content"], "hello updated")
	}
	if edited["editedAt"] == nil {
		t.Error("editedAt should be set")
	}
}

func TestDeleteMessage(t *testing.T) {
	h := setup(t)

	// Bootstrap user
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	if w.Code != 201 {
		t.Fatalf("bootstrap status = %d, body = %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()

	// List channels to get #general ID
	w = doReqWithCookie(h, "GET", "/api/channels", nil, cookies)
	var chs []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &chs)
	if len(chs) == 0 {
		t.Fatal("no channels")
	}
	channelID := int(chs[0]["id"].(float64))

	// Create message
	w = doReqWithCookie(h, "POST", fmt.Sprintf("/api/channels/%d/messages", channelID),
		map[string]string{"content": "to be deleted"}, cookies)
	if w.Code != 201 {
		t.Fatalf("create message status = %d, body = %s", w.Code, w.Body.String())
	}
	var msg map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &msg)
	msgID := int(msg["id"].(float64))

	// Delete message
	w = doReqWithCookie(h, "DELETE", fmt.Sprintf("/api/messages/%d", msgID), nil, cookies)
	if w.Code != 200 {
		t.Fatalf("delete message status = %d, body = %s", w.Code, w.Body.String())
	}

	// List messages - deleted message should not appear
	w = doReqWithCookie(h, "GET", fmt.Sprintf("/api/channels/%d/messages", channelID), nil, cookies)
	if w.Code != 200 {
		t.Fatalf("list messages status = %d", w.Code)
	}
	var msgs []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &msgs)
	for _, m := range msgs {
		if int(m["id"].(float64)) == msgID {
			t.Error("deleted message should not appear in list")
		}
	}
}

func TestAdminOnlyEndpoints(t *testing.T) {
	h := setup(t)

	// Bootstrap admin
	w := doReq(h, "POST", "/api/auth/bootstrap", map[string]string{
		"username": "admin", "password": "secret",
	})
	adminCookies := w.Result().Cookies()

	// Create invite for member
	w = doReqWithCookie(h, "POST", "/api/invites", nil, adminCookies)
	var invite auth.Invite
	json.Unmarshal(w.Body.Bytes(), &invite)

	// Signup member
	w = doReq(h, "POST", "/api/auth/signup", map[string]string{
		"username": "member", "password": "pass", "inviteCode": invite.Code,
	})
	memberCookies := w.Result().Cookies()

	// Member can't create invites
	w = doReqWithCookie(h, "POST", "/api/invites", nil, memberCookies)
	if w.Code != 403 {
		t.Errorf("member create invite = %d, want 403", w.Code)
	}

	// Member can't list users
	w = doReqWithCookie(h, "GET", "/api/users", nil, memberCookies)
	if w.Code != 403 {
		t.Errorf("member list users = %d, want 403", w.Code)
	}

	// Admin can list users
	w = doReqWithCookie(h, "GET", "/api/users", nil, adminCookies)
	if w.Code != 200 {
		t.Errorf("admin list users = %d, want 200", w.Code)
	}
}
