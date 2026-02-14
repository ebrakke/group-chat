// Package api provides JSON HTTP handlers for the app.
package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/channels"
)

type Handler struct {
	auth     *auth.Service
	channels *channels.Service
	mux      *http.ServeMux
}

func New(authSvc *auth.Service, chanSvc *channels.Service) *Handler {
	h := &Handler{auth: authSvc, channels: chanSvc, mux: http.NewServeMux()}
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

	// Users
	h.mux.HandleFunc("GET /api/users", h.handleListUsers)
	h.mux.HandleFunc("POST /api/users/{id}/reset-password", h.handleResetPassword)
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
	return h.auth.ValidateSession(token)
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
