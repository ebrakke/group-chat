// Package api provides JSON HTTP handlers for the app.
package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/bots"
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/messages"
	"github.com/ebrakke/relay-chat/internal/reactions"
	"github.com/ebrakke/relay-chat/internal/ws"
)

type Handler struct {
	auth      *auth.Service
	bots      *bots.Service
	channels  *channels.Service
	messages  *messages.Service
	reactions *reactions.Service
	hub       *ws.Hub
	mux       *http.ServeMux
}

func New(authSvc *auth.Service, botSvc *bots.Service, chanSvc *channels.Service, msgSvc *messages.Service, reactSvc *reactions.Service, hub *ws.Hub) *Handler {
	h := &Handler{auth: authSvc, bots: botSvc, channels: chanSvc, messages: msgSvc, reactions: reactSvc, hub: hub, mux: http.NewServeMux()}
	h.routes()
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) routes() {
	h.mux.HandleFunc("GET /api/health", h.handleHealth)

	// Auth
	h.mux.HandleFunc("GET /api/auth/has-users", h.handleHasUsers)
	h.mux.HandleFunc("POST /api/auth/bootstrap", h.handleBootstrap)
	h.mux.HandleFunc("POST /api/auth/login", h.handleLogin)
	h.mux.HandleFunc("POST /api/auth/logout", h.handleLogout)
	h.mux.HandleFunc("POST /api/auth/signup", h.handleSignup)
	h.mux.HandleFunc("GET /api/auth/me", h.handleMe)

	// Invites
	h.mux.HandleFunc("POST /api/invites", h.handleCreateInvite)
	h.mux.HandleFunc("GET /api/invites", h.handleListInvites)

	// Channels
	h.mux.HandleFunc("GET /api/channels", h.handleListChannels)
	h.mux.HandleFunc("POST /api/channels", h.handleCreateChannel)

	// Messages
	h.mux.HandleFunc("GET /api/channels/{id}/messages", h.handleListMessages)
	h.mux.HandleFunc("POST /api/channels/{id}/messages", h.handleCreateMessage)
	h.mux.HandleFunc("GET /api/messages/{id}/thread", h.handleListThread)
	h.mux.HandleFunc("POST /api/messages/{id}/reply", h.handleCreateReply)

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
}

// --- Auth handlers ---

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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

	// Auto-join #general
	h.autoJoinGeneral(user.ID)

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

	// Auto-join #general
	h.autoJoinGeneral(user.ID)

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
	_, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	chs, err := h.channels.List()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if chs == nil {
		chs = []channels.Channel{}
	}
	writeJSON(w, http.StatusOK, chs)
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

type messageWithReactions struct {
	messages.Message
	Reactions []reactions.ReactionSummary `json:"reactions"`
}

func (h *Handler) attachReactions(msgs []messages.Message) []messageWithReactions {
	ids := make([]int64, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
	}
	summaryMap, _ := h.reactions.SummaryForMessages(ids)

	result := make([]messageWithReactions, len(msgs))
	for i, m := range msgs {
		s := summaryMap[m.ID]
		if s == nil {
			s = []reactions.ReactionSummary{}
		}
		result[i] = messageWithReactions{Message: m, Reactions: s}
	}
	return result
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
	writeJSON(w, http.StatusOK, h.attachReactions(msgs))
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

	// Broadcast to WebSocket clients
	h.hub.Broadcast(ws.Event{Type: "new_message", Payload: msg, ChannelID: channelID})

	writeJSON(w, http.StatusCreated, msg)
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
	writeJSON(w, http.StatusOK, h.attachReactions(msgs))
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

	// Broadcast to WebSocket clients
	h.hub.Broadcast(ws.Event{Type: "new_reply", Payload: msg, ChannelID: parent.ChannelID})

	writeJSON(w, http.StatusCreated, msg)
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
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Helpers ---

func (h *Handler) autoJoinGeneral(userID int64) {
	ch, err := h.channels.EnsureGeneral()
	if err != nil {
		log.Printf("warning: could not ensure #general: %v", err)
		return
	}
	if err := h.channels.AddMember(ch.ID, userID); err != nil {
		log.Printf("warning: could not add user %d to #general: %v", userID, err)
	}
}

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
