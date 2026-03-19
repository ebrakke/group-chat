// Package api provides JSON HTTP handlers for the app.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/bots"
	"github.com/ebrakke/relay-chat/internal/calendar"
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/files"
	"github.com/ebrakke/relay-chat/internal/messages"
	"github.com/ebrakke/relay-chat/internal/notifications"
	"github.com/ebrakke/relay-chat/internal/reactions"
	"github.com/ebrakke/relay-chat/internal/search"
	"github.com/ebrakke/relay-chat/internal/ws"
)

type Handler struct {
	auth          *auth.Service
	bots          *bots.Service
	channels      *channels.Service
	calendar      *calendar.Service
	messages      *messages.Service
	reactions     *reactions.Service
	notifications *notifications.Service
	files         *files.Service
	search        *search.Service
	version       string
	hub           *ws.Hub
	mux           *http.ServeMux
}

func New(authSvc *auth.Service, botSvc *bots.Service, chanSvc *channels.Service, calSvc *calendar.Service, msgSvc *messages.Service, reactSvc *reactions.Service, notifySvc *notifications.Service, fileSvc *files.Service, searchSvc *search.Service, version string, hub *ws.Hub) *Handler {
	h := &Handler{
		auth:          authSvc,
		bots:          botSvc,
		channels:      chanSvc,
		calendar:      calSvc,
		messages:      msgSvc,
		reactions:     reactSvc,
		notifications: notifySvc,
		files:         fileSvc,
		search:        searchSvc,
		version:       version,
		hub:           hub,
		mux:           http.NewServeMux(),
	}
	h.routes()
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	corsMiddleware(h.mux).ServeHTTP(w, r)
}

func (h *Handler) routes() {
	h.mux.HandleFunc("GET /api/health", h.handleHealth)

	// Auth
	authRL := newRateLimiter(30, time.Minute)
	h.mux.HandleFunc("GET /api/auth/has-users", h.handleHasUsers)
	h.mux.HandleFunc("POST /api/auth/bootstrap", authRL.middleware(h.handleBootstrap))
	h.mux.HandleFunc("POST /api/auth/login", authRL.middleware(h.handleLogin))
	h.mux.HandleFunc("POST /api/auth/logout", h.handleLogout)
	h.mux.HandleFunc("POST /api/auth/signup", authRL.middleware(h.handleSignup))
	h.mux.HandleFunc("GET /api/auth/me", h.handleMe)

	// Account
	h.mux.HandleFunc("POST /api/account/password", h.handleChangePassword)
	h.mux.HandleFunc("PUT /api/account/avatar", h.handleUploadAvatar)
	h.mux.HandleFunc("DELETE /api/account/avatar", h.handleDeleteAvatar)

	// Invites
	h.mux.HandleFunc("POST /api/invites", h.handleCreateInvite)
	h.mux.HandleFunc("GET /api/invites", h.handleListInvites)

	// Channels
	h.mux.HandleFunc("GET /api/channels", h.handleListChannels)
	h.mux.HandleFunc("POST /api/channels", h.handleCreateChannel)
	h.mux.HandleFunc("POST /api/channels/{id}/read", h.handleMarkRead)

	// Messages
	h.mux.HandleFunc("GET /api/channels/{id}/messages", h.handleListMessages)
	h.mux.HandleFunc("POST /api/channels/{id}/messages", h.handleCreateMessage)
	h.mux.HandleFunc("GET /api/messages/{id}/thread", h.handleListThread)
	h.mux.HandleFunc("POST /api/messages/{id}/reply", h.handleCreateReply)
	h.mux.HandleFunc("PUT /api/messages/{id}", h.handleEditMessage)
	h.mux.HandleFunc("DELETE /api/messages/{id}", h.handleDeleteMessage)

	// My Threads
	h.mux.HandleFunc("GET /api/me/threads", h.handleMyThreads)

	// Reactions
	h.mux.HandleFunc("POST /api/messages/{id}/reactions", h.handleAddReaction)
	h.mux.HandleFunc("DELETE /api/messages/{id}/reactions/{emoji}", h.handleRemoveReaction)

	// Users
	h.mux.HandleFunc("GET /api/users", h.handleListUsers)
	h.mux.HandleFunc("GET /api/users/search", h.handleSearchUsers)
	h.mux.HandleFunc("POST /api/users/{id}/reset-password", h.handleResetPassword)

	// Bots (admin-only)
	h.mux.HandleFunc("GET /api/bots", h.handleListBots)
	h.mux.HandleFunc("POST /api/bots", h.handleCreateBot)
	h.mux.HandleFunc("DELETE /api/bots/{id}", h.handleDeleteBot)
	h.mux.HandleFunc("GET /api/bots/{id}/tokens", h.handleListBotTokens)
	h.mux.HandleFunc("POST /api/bots/{id}/tokens", h.handleGenerateBotToken)
	h.mux.HandleFunc("DELETE /api/bots/tokens/{id}", h.handleRevokeBotToken)
	h.mux.HandleFunc("GET /api/bots/{id}/bindings", h.handleListBotBindings)
	h.mux.HandleFunc("POST /api/bots/{id}/bindings", h.handleBindBotChannel)
	h.mux.HandleFunc("DELETE /api/bots/{id}/bindings/{channelId}", h.handleUnbindBotChannel)

	// Notifications
	h.mux.HandleFunc("GET /api/notifications/settings", h.handleGetNotificationSettings)
	h.mux.HandleFunc("POST /api/notifications/settings", h.handleUpdateNotificationSettings)
	h.mux.HandleFunc("POST /api/threads/{id}/mute", h.handleMuteThread)
	h.mux.HandleFunc("DELETE /api/threads/{id}/mute", h.handleUnmuteThread)
	h.mux.HandleFunc("GET /api/threads/{id}/mute", h.handleGetThreadMute)
	h.mux.HandleFunc("GET /api/push/vapid-key", h.handleGetVAPIDKey)
	h.mux.HandleFunc("POST /api/push/subscribe", h.handlePushSubscribe)
	h.mux.HandleFunc("DELETE /api/push/subscribe", h.handlePushUnsubscribe)
	h.mux.HandleFunc("GET /api/push/subscriptions", h.handleGetPushSubscriptions)

	// Files
	h.mux.HandleFunc("POST /api/upload", h.handleUploadFile)
	h.mux.HandleFunc("GET /api/files/{id}", h.handleGetFile)
	h.mux.HandleFunc("DELETE /api/files/{id}", h.handleDeleteFile)

	// Search
	h.mux.HandleFunc("GET /api/search", h.handleSearch)

	// Calendar
	h.mux.HandleFunc("GET /api/calendar", h.handleListCalendarEvents)
	h.mux.HandleFunc("POST /api/calendar", h.handleCreateCalendarEvent)
	h.mux.HandleFunc("GET /api/calendar/{id}", h.handleGetCalendarEvent)
	h.mux.HandleFunc("PUT /api/calendar/{id}", h.handleUpdateCalendarEvent)
	h.mux.HandleFunc("DELETE /api/calendar/{id}", h.handleDeleteCalendarEvent)

	// Admin settings
	h.mux.HandleFunc("GET /api/admin/settings", h.handleGetAdminSettings)
	h.mux.HandleFunc("POST /api/admin/settings", h.handleUpdateAdminSettings)
}

// --- Auth handlers ---

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": h.version,
	})
}

func (h *Handler) handleHasUsers(w http.ResponseWriter, r *http.Request) {
	has, err := h.auth.HasUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"hasUsers": has})
}

func (h *Handler) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.Username == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, errors.New("username and password required"))
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	user, token, err := h.auth.Bootstrap(req.Username, req.Password, req.DisplayName)
	if err != nil {
		writeErr(w, http.StatusConflict, err)
		return
	}

	setSessionCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"user": user, "token": token})
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	user, token, err := h.auth.Login(req.Username, req.Password)
	if errors.Is(err, auth.ErrInvalidLogin) {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": user, "token": token})
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	if token != "" {
		h.auth.Logout(token)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
		InviteCode  string `json:"inviteCode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.Username == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, errors.New("username and password required"))
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	user, token, err := h.auth.Signup(req.Username, req.Password, req.DisplayName, req.InviteCode)
	if errors.Is(err, auth.ErrInviteRequired) || errors.Is(err, auth.ErrInvalidInvite) {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, auth.ErrUserExists) {
		writeErr(w, http.StatusConflict, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	setSessionCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"user": user, "token": token})
}

func (h *Handler) handleMe(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// --- Account handlers ---

func (h *Handler) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CurrentPassword == "" || req.NewPassword == "" {
		writeErr(w, http.StatusBadRequest, errors.New("currentPassword and newPassword required"))
		return
	}

	if err := h.auth.ChangePassword(user.ID, req.CurrentPassword, req.NewPassword); err != nil {
		if errors.Is(err, auth.ErrInvalidLogin) {
			writeErr(w, http.StatusForbidden, errors.New("current password incorrect"))
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("file field required"))
		return
	}
	defer file.Close()

	// Detect MIME type server-side
	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to read file"))
		return
	}
	mimeType := http.DetectContentType(buf[:n])
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to seek file"))
		return
	}

	if !files.IsImage(mimeType) {
		writeErr(w, http.StatusBadRequest, errors.New("file must be an image"))
		return
	}

	// Delete old avatar file if exists
	oldFileID, _ := h.auth.GetProfilePictureFileID(user.ID)
	if oldFileID > 0 {
		h.files.Delete(oldFileID)
	}

	f, err := h.files.Upload(user.ID, header.Filename, mimeType, header.Size, file)
	if errors.Is(err, files.ErrTooLarge) {
		writeErr(w, http.StatusRequestEntityTooLarge, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	if err := h.auth.SetProfilePicture(user.ID, f.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	updated, err := h.auth.GetUserByID(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) handleDeleteAvatar(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	fileID, err := h.auth.ClearProfilePicture(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if fileID > 0 {
		h.files.Delete(fileID)
	}

	updated, err := h.auth.GetUserByID(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// --- Invite handlers ---

func (h *Handler) handleCreateInvite(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("admin only"))
		return
	}

	var req struct {
		ExpiresInHours *int `json:"expiresInHours,omitempty"`
		MaxUses        *int `json:"maxUses,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var expiresAt *time.Time
	if req.ExpiresInHours != nil {
		t := time.Now().Add(time.Duration(*req.ExpiresInHours) * time.Hour)
		expiresAt = &t
	}

	invite, err := h.auth.CreateInvite(user.ID, expiresAt, req.MaxUses)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, invite)
}

func (h *Handler) handleListInvites(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("admin only"))
		return
	}

	invites, err := h.auth.ListInvites()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if invites == nil {
		invites = []auth.Invite{}
	}
	writeJSON(w, http.StatusOK, invites)
}

// --- Channel handlers ---

func (h *Handler) handleListChannels(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	chs, err := h.channels.ListForUser(user.ID, user.Username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if chs == nil {
		chs = []channels.ChannelWithUnread{}
	}
	writeJSON(w, http.StatusOK, chs)
}

func (h *Handler) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	channelID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid channel id"))
		return
	}

	var req struct {
		MessageID int64 `json:"messageId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.MessageID <= 0 {
		writeErr(w, http.StatusBadRequest, errors.New("messageId required"))
		return
	}

	if err := h.channels.MarkRead(channelID, user.ID, req.MessageID); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

var channelNameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

func (h *Handler) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	req.Name = strings.TrimSpace(req.Name)

	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, errors.New("name is required"))
		return
	}
	if len(req.Name) > 50 {
		writeErr(w, http.StatusBadRequest, errors.New("name must be 50 characters or less"))
		return
	}
	if !channelNameRe.MatchString(req.Name) {
		writeErr(w, http.StatusBadRequest, errors.New("name must be lowercase alphanumeric and hyphens, cannot start or end with a hyphen"))
		return
	}

	ch, err := h.channels.Create(req.Name)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			writeErr(w, http.StatusConflict, errors.New("channel already exists"))
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	h.hub.Broadcast(ws.Event{Type: "channel_created", Payload: ch})
	writeJSON(w, http.StatusCreated, ch)
}

// --- Message handlers ---

type messageResponse struct {
	messages.Message
	Reactions []reactions.ReactionSummary `json:"reactions"`
	Files     []files.File               `json:"files,omitempty"`
}

func (h *Handler) enrichMessages(msgs []messages.Message) []messageResponse {
	ids := make([]int64, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
	}
	summaryMap, _ := h.reactions.SummaryForMessages(ids)

	result := make([]messageResponse, len(msgs))
	for i, m := range msgs {
		s := summaryMap[m.ID]
		if s == nil {
			s = []reactions.ReactionSummary{}
		}
		msgFiles, _ := h.files.ListByMessage(m.ID)
		result[i] = messageResponse{Message: m, Reactions: s, Files: msgFiles}
	}
	return result
}

func (h *Handler) enrichMessage(msg *messages.Message) messageResponse {
	var r []reactions.ReactionSummary
	summaryMap, _ := h.reactions.SummaryForMessages([]int64{msg.ID})
	if s := summaryMap[msg.ID]; s != nil {
		r = s
	} else {
		r = []reactions.ReactionSummary{}
	}
	msgFiles, _ := h.files.ListByMessage(msg.ID)
	return messageResponse{Message: *msg, Reactions: r, Files: msgFiles}
}

func (h *Handler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	channelID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid channel id"))
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)

	msgs, err := h.messages.ListChannel(channelID, limit, before)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if msgs == nil {
		msgs = []messages.Message{}
	}
	writeJSON(w, http.StatusOK, h.enrichMessages(msgs))
}

func (h *Handler) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	channelID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid channel id"))
		return
	}

	// Bot permission check
	if user.IsBot {
		canWrite, err := h.bots.CanWrite(user.ID, channelID)
		if err != nil || !canWrite {
			writeErr(w, http.StatusForbidden, errors.New("bot not authorized for this channel"))
			return
		}
	}

	// Verify channel exists and get name for group ID
	ch, err := h.channels.GetByID(channelID)
	if err != nil {
		writeErr(w, http.StatusNotFound, errors.New("channel not found"))
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeErr(w, http.StatusBadRequest, errors.New("content required"))
		return
	}

	msg, err := h.messages.Create(channelID, user.ID, req.Content, ch.Name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Notifications are sent by the message service via callback

	enriched := h.enrichMessage(msg)

	// Broadcast to WebSocket clients
	h.hub.Broadcast(ws.Event{Type: "new_message", Payload: enriched, ChannelID: channelID})

	writeJSON(w, http.StatusCreated, enriched)
}

func (h *Handler) handleListThread(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	parentID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)

	msgs, err := h.messages.ListThread(parentID, limit, before)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if msgs == nil {
		msgs = []messages.Message{}
	}
	writeJSON(w, http.StatusOK, h.enrichMessages(msgs))
}

func (h *Handler) handleCreateReply(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	parentID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	// Look up parent to get channel name for group ID
	parent, err := h.messages.GetByID(parentID)
	if err != nil {
		writeErr(w, http.StatusNotFound, errors.New("parent message not found"))
		return
	}

	// Bot permission check
	if user.IsBot {
		canWrite, err := h.bots.CanWrite(user.ID, parent.ChannelID)
		if err != nil || !canWrite {
			writeErr(w, http.StatusForbidden, errors.New("bot not authorized for this channel"))
			return
		}
	}

	ch, err := h.channels.GetByID(parent.ChannelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeErr(w, http.StatusBadRequest, errors.New("content required"))
		return
	}

	msg, err := h.messages.CreateReply(parentID, user.ID, req.Content, ch.Name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Notifications are sent by the message service via callback

	enriched := h.enrichMessage(msg)

	// Broadcast to WebSocket clients
	h.hub.Broadcast(ws.Event{Type: "new_reply", Payload: enriched, ChannelID: parent.ChannelID})

	writeJSON(w, http.StatusCreated, enriched)
}

func (h *Handler) handleEditMessage(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeErr(w, http.StatusBadRequest, errors.New("content required"))
		return
	}

	msg, err := h.messages.Edit(messageID, user.ID, req.Content)
	if errors.Is(err, messages.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if errors.Is(err, messages.ErrForbidden) {
		writeErr(w, http.StatusForbidden, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	enriched := h.enrichMessage(msg)
	h.hub.Broadcast(ws.Event{Type: "message_edited", Payload: enriched, ChannelID: msg.ChannelID})
	writeJSON(w, http.StatusOK, enriched)
}

func (h *Handler) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	// Get message first (for channelID for broadcast)
	msg, err := h.messages.GetByID(messageID)
	if errors.Is(err, messages.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	err = h.messages.Delete(messageID, user.ID, user.Role == "admin")
	if errors.Is(err, messages.ErrForbidden) {
		writeErr(w, http.StatusForbidden, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	h.hub.Broadcast(ws.Event{
		Type:      "message_deleted",
		Payload:   map[string]int64{"messageId": messageID},
		ChannelID: msg.ChannelID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- My Threads handler ---

func (h *Handler) handleMyThreads(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	threads, err := h.messages.ListUserThreads(user.ID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if threads == nil {
		threads = []messages.ThreadSummary{}
	}
	writeJSON(w, http.StatusOK, threads)
}

// --- Reaction handlers ---

func (h *Handler) handleAddReaction(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	// Look up message to get channel for group ID
	msg, err := h.messages.GetByID(messageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, errors.New("message not found"))
		return
	}

	// Bot permission check
	if user.IsBot {
		canWrite, err := h.bots.CanWrite(user.ID, msg.ChannelID)
		if err != nil || !canWrite {
			writeErr(w, http.StatusForbidden, errors.New("bot not authorized for this channel"))
			return
		}
	}

	ch, err := h.channels.GetByID(msg.ChannelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	reaction, err := h.reactions.Add(messageID, user.ID, req.Emoji, ch.Name)
	if errors.Is(err, reactions.ErrInvalidEmoji) {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	h.hub.Broadcast(ws.Event{Type: "reaction_added", Payload: reaction, ChannelID: msg.ChannelID})

	writeJSON(w, http.StatusCreated, reaction)
}

func (h *Handler) handleRemoveReaction(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid message id"))
		return
	}

	emoji := r.PathValue("emoji")

	// Look up message to get channel for broadcast filtering
	msg, err := h.messages.GetByID(messageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, errors.New("message not found"))
		return
	}

	// Bot permission check
	if user.IsBot {
		canWrite, err := h.bots.CanWrite(user.ID, msg.ChannelID)
		if err != nil || !canWrite {
			writeErr(w, http.StatusForbidden, errors.New("bot not authorized for this channel"))
			return
		}
	}

	err = h.reactions.Remove(messageID, user.ID, emoji)
	if errors.Is(err, reactions.ErrInvalidEmoji) {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if errors.Is(err, reactions.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	h.hub.Broadcast(ws.Event{Type: "reaction_removed", Payload: map[string]interface{}{
		"messageId": messageID,
		"emoji":     emoji,
		"userId":    user.ID,
	}, ChannelID: msg.ChannelID})

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- User handlers ---

func (h *Handler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("admin only"))
		return
	}

	users, err := h.auth.ListUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if users == nil {
		users = []auth.User{}
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *Handler) handleSearchUsers(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	q := r.URL.Query().Get("q")
	users, err := h.auth.SearchUsers(q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if users == nil {
		users = []auth.User{}
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *Handler) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	admin, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if admin.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("admin only"))
		return
	}

	idStr := r.PathValue("id")
	userID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid user id"))
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		writeErr(w, http.StatusBadRequest, errors.New("password required"))
		return
	}

	if err := h.auth.ResetPassword(userID, req.Password); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Bot handlers (admin-only) ---

func (h *Handler) requireAdmin(r *http.Request) (*auth.User, error) {
	user, err := h.requireAuth(r)
	if err != nil {
		return nil, err
	}
	if user.Role != "admin" {
		return nil, errors.New("admin only")
	}
	return user, nil
}

func (h *Handler) handleListBots(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	list, err := h.bots.List()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if list == nil {
		list = []bots.Bot{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) handleCreateBot(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.Username == "" {
		writeErr(w, http.StatusBadRequest, errors.New("username required"))
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	bot, err := h.bots.Create(req.Username, req.DisplayName)
	if errors.Is(err, bots.ErrExists) {
		writeErr(w, http.StatusConflict, errors.New("username already exists"))
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, bot)
}

func (h *Handler) handleDeleteBot(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	if err := h.bots.Delete(botID); err != nil {
		if errors.Is(err, bots.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleListBotTokens(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	tokens, err := h.bots.ListTokens(botID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if tokens == nil {
		tokens = []bots.BotToken{}
	}
	writeJSON(w, http.StatusOK, tokens)
}

func (h *Handler) handleGenerateBotToken(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	var req struct {
		Label string `json:"label"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	token, err := h.bots.GenerateToken(botID, req.Label)
	if err != nil {
		if errors.Is(err, bots.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, token)
}

func (h *Handler) handleRevokeBotToken(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	tokenID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid token id"))
		return
	}

	if err := h.bots.RevokeToken(tokenID); err != nil {
		if errors.Is(err, bots.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleListBotBindings(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	bindings, err := h.bots.ListBindings(botID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if bindings == nil {
		bindings = []bots.ChannelBinding{}
	}
	writeJSON(w, http.StatusOK, bindings)
}

func (h *Handler) handleBindBotChannel(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	var req struct {
		ChannelID int64 `json:"channelId"`
		CanRead   *bool `json:"canRead"`
		CanWrite  *bool `json:"canWrite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if req.ChannelID == 0 {
		writeErr(w, http.StatusBadRequest, errors.New("channelId required"))
		return
	}

	canRead := true
	canWrite := true
	if req.CanRead != nil {
		canRead = *req.CanRead
	}
	if req.CanWrite != nil {
		canWrite = *req.CanWrite
	}

	binding, err := h.bots.BindChannel(botID, req.ChannelID, canRead, canWrite)
	if err != nil {
		if errors.Is(err, bots.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Refresh permissions for connected bot clients
	h.hub.RefreshBotPermissions(botID)

	writeJSON(w, http.StatusCreated, binding)
}

func (h *Handler) handleUnbindBotChannel(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	botID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid bot id"))
		return
	}

	channelID, err := strconv.ParseInt(r.PathValue("channelId"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid channel id"))
		return
	}

	if err := h.bots.UnbindChannel(botID, channelID); err != nil {
		if errors.Is(err, bots.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Refresh permissions for connected bot clients
	h.hub.RefreshBotPermissions(botID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Notification handlers ---

func (h *Handler) handleGetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	settings, err := h.notifications.GetSettings(user.ID)
	if errors.Is(err, notifications.ErrSettingsNotFound) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"configured": false,
		})
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to get settings"))
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

func (h *Handler) handleUpdateNotificationSettings(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req notifications.Settings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid request"))
		return
	}

	req.UserID = user.ID
	if err := h.notifications.UpdateSettings(user.ID, &req); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to update settings"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleMuteThread(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid thread ID"))
		return
	}

	if err := h.notifications.MuteThread(user.ID, messageID); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to mute thread"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleUnmuteThread(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid thread ID"))
		return
	}

	if err := h.notifications.UnmuteThread(user.ID, messageID); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to unmute thread"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleGetThreadMute(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	messageID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("Invalid thread ID"))
		return
	}

	muted, err := h.notifications.IsThreadMuted(user.ID, messageID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("Failed to check mute status"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"muted": muted})
}

func (h *Handler) handleGetVAPIDKey(w http.ResponseWriter, r *http.Request) {
	key, err := h.notifications.GetVAPIDPublicKey()
	if err != nil || key == "" {
		writeErr(w, http.StatusServiceUnavailable, errors.New("VAPID keys not configured"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": key})
}

func (h *Handler) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		Endpoint string `json:"endpoint"`
		P256dh   string `json:"p256dh"`
		Auth     string `json:"auth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid request"))
		return
	}
	if req.Endpoint == "" || req.P256dh == "" || req.Auth == "" {
		writeErr(w, http.StatusBadRequest, errors.New("endpoint, p256dh, and auth are required"))
		return
	}

	sub := notifications.WebPushSubscription{
		Endpoint:  req.Endpoint,
		P256dh:    req.P256dh,
		Auth:      req.Auth,
		UserAgent: r.UserAgent(),
	}
	if err := h.notifications.SaveWebPushSubscription(user.ID, sub); err != nil {
		writeErr(w, http.StatusConflict, errors.New(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid request"))
		return
	}
	if req.Endpoint == "" {
		writeErr(w, http.StatusBadRequest, errors.New("endpoint is required"))
		return
	}

	if err := h.notifications.DeleteWebPushSubscription(req.Endpoint); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to unsubscribe"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleGetPushSubscriptions(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	subs, err := h.notifications.GetWebPushSubscriptions(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to get subscriptions"))
		return
	}
	if subs == nil {
		subs = []notifications.WebPushSubscription{}
	}
	writeJSON(w, http.StatusOK, subs)
}


// --- Admin Settings handlers ---

func (h *Handler) handleGetAdminSettings(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		http.Error(w, "admin only", http.StatusForbidden)
		return
	}

	settings, err := h.notifications.GetAppSettings()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Transform to camelCase for frontend
	response := make(map[string]string)
	for k, v := range settings {
		switch k {
		case "base_url":
			response["baseUrl"] = v
		default:
			response[k] = v
		}
	}

	json.NewEncoder(w).Encode(response)
}

func (h *Handler) handleUpdateAdminSettings(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	if user.Role != "admin" {
		http.Error(w, "admin only", http.StatusForbidden)
		return
	}

	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.notifications.UpdateAppSettings(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// --- File handlers ---

func (h *Handler) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("file field required"))
		return
	}
	defer file.Close()

	// Detect MIME type server-side instead of trusting the client header
	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to read file"))
		return
	}
	mimeType := http.DetectContentType(buf[:n])
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to seek file"))
		return
	}

	f, err := h.files.Upload(user.ID, header.Filename, mimeType, header.Size, file)
	if errors.Is(err, files.ErrTooLarge) {
		writeErr(w, http.StatusRequestEntityTooLarge, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Optionally attach to a message
	if msgIDStr := r.FormValue("messageId"); msgIDStr != "" {
		messageID, err := strconv.ParseInt(msgIDStr, 10, 64)
		if err == nil {
			if err := h.files.AttachToMessage(f.ID, messageID); err != nil {
				log.Printf("warning: attach file %d to message %d: %v", f.ID, messageID, err)
			} else {
				f.MessageID = &messageID
			}
		}
	}

	writeJSON(w, http.StatusCreated, f)
}

func (h *Handler) handleGetFile(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid file id"))
		return
	}

	f, err := h.files.GetByID(id)
	if errors.Is(err, files.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	path := h.files.FilePath(f.Filename)
	w.Header().Set("Content-Type", f.MimeType)
	if files.IsImage(f.MimeType) {
		w.Header().Set("Content-Disposition", "inline")
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", f.OriginalName))
	}
	http.ServeFile(w, r, path)
}

func (h *Handler) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid file id"))
		return
	}

	f, err := h.files.GetByID(id)
	if errors.Is(err, files.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	if f.UploaderID != user.ID && user.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("not allowed"))
		return
	}

	if err := h.files.Delete(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Search ---

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		writeErr(w, http.StatusBadRequest, errors.New("q parameter required"))
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	results, err := h.search.Search(q, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if results == nil {
		results = []search.Result{}
	}
	writeJSON(w, http.StatusOK, results)
}

// --- Calendar handlers ---

func (h *Handler) handleListCalendarEvents(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	var events []calendar.CalendarEvent
	if from != "" && to != "" {
		events, err = h.calendar.ListRange(from, to)
	} else {
		events, err = h.calendar.List()
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if events == nil {
		events = []calendar.CalendarEvent{}
	}
	writeJSON(w, http.StatusOK, events)
}

func (h *Handler) handleCreateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	var req struct {
		Title     string `json:"title"`
		StartTime string `json:"startTime"`
		EndTime   string `json:"endTime"`
		Comments  string `json:"comments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ev, err := h.calendar.Create(user.ID, req.Title, req.StartTime, req.EndTime, req.Comments)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	h.hub.Broadcast(ws.Event{Type: "calendar_event_created", Payload: ev})
	writeJSON(w, http.StatusCreated, ev)
}

func (h *Handler) handleGetCalendarEvent(w http.ResponseWriter, r *http.Request) {
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid calendar event id"))
		return
	}
	ev, err := h.calendar.GetByID(id)
	if err != nil {
		if errors.Is(err, calendar.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

func (h *Handler) handleUpdateCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid calendar event id"))
		return
	}
	var req struct {
		Title     string `json:"title"`
		StartTime string `json:"startTime"`
		EndTime   string `json:"endTime"`
		Comments  string `json:"comments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ev, err := h.calendar.Update(id, user.ID, req.Title, req.StartTime, req.EndTime, req.Comments)
	if err != nil {
		if errors.Is(err, calendar.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	h.hub.Broadcast(ws.Event{Type: "calendar_event_updated", Payload: ev})
	writeJSON(w, http.StatusOK, ev)
}

func (h *Handler) handleDeleteCalendarEvent(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, errors.New("invalid calendar event id"))
		return
	}
	ev, err := h.calendar.GetByID(id)
	if err != nil {
		if errors.Is(err, calendar.ErrNotFound) {
			writeErr(w, http.StatusNotFound, err)
			return
		}
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if ev.CreatedBy != user.ID && user.Role != "admin" {
		writeErr(w, http.StatusForbidden, errors.New("only the event creator or an admin can delete this event"))
		return
	}
	if err := h.calendar.Delete(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	h.hub.Broadcast(ws.Event{Type: "calendar_event_deleted", Payload: map[string]int64{"id": id}})
	w.WriteHeader(http.StatusNoContent)
}

// --- Helpers ---

func (h *Handler) requireAuth(r *http.Request) (*auth.User, error) {
	token := extractToken(r)
	if token == "" {
		return nil, auth.ErrUnauthorized
	}
	// Try session token first
	user, err := h.auth.ValidateSession(token)
	if err == nil {
		return user, nil
	}
	// Try bot token
	user, err = h.bots.ValidateToken(token)
	if err == nil {
		return user, nil
	}
	return nil, auth.ErrUnauthorized
}

func extractToken(r *http.Request) string {
	// Check Authorization header
	if ah := r.Header.Get("Authorization"); ah != "" {
		if strings.HasPrefix(ah, "Bearer ") {
			return ah[7:]
		}
	}
	// Check cookie
	if c, err := r.Cookie("session"); err == nil {
		return c.Value
	}
	return ""
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 3600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
