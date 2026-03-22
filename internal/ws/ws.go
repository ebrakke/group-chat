// Package ws provides a WebSocket hub for real-time message broadcast.
package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"golang.org/x/net/websocket"
)

// Event is a message broadcast to connected clients.
type Event struct {
	Type          string      `json:"type"`
	Payload       interface{} `json:"payload"`
	ChannelID     int64       `json:"-"` // used for bot filtering, not serialized
	ExcludeUserID int64       `json:"-"` // skip this user when broadcasting
}

// AuthResult is returned by AuthFunc with user metadata.
type AuthResult struct {
	UserID     int64
	IsBot      bool
	ChannelIDs []int64 // bound channel IDs (bots only)
}

type client struct {
	conn       *websocket.Conn
	userID     int64
	isBot      bool
	channelIDs map[int64]bool // bound channels for bot filtering
}

// Hub manages WebSocket connections and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	// AuthFunc validates a token and returns auth metadata. Set by the app.
	AuthFunc func(token string) (*AuthResult, error)
	// GetChannelIDsFunc retrieves current channel IDs for a bot. Set by the app.
	GetChannelIDsFunc func(userID int64) ([]int64, error)
	// GetDisplayNameFunc retrieves display name for a user. Set by the app.
	GetDisplayNameFunc func(userID int64) string
	// DM filtering
	dmMu    sync.RWMutex
	dmChans map[int64][2]int64 // channel ID -> [user1_id, user2_id]
	// Typing indicator rate limiting
	typingMu   sync.Mutex
	typingLast map[string]time.Time
}

// NewHub creates a new WebSocket hub.
func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*client]struct{}),
		dmChans:    make(map[int64][2]int64),
		typingLast: make(map[string]time.Time),
	}
	go h.cleanupTypingRates()
	return h
}

func (h *Hub) cleanupTypingRates() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		h.typingMu.Lock()
		now := time.Now()
		for k, t := range h.typingLast {
			if now.Sub(t) > 5*time.Second {
				delete(h.typingLast, k)
			}
		}
		h.typingMu.Unlock()
	}
}

// Handler returns the HTTP handler for WebSocket connections.
// Clients must provide ?token=<session_token> query param.
func (h *Hub) Handler() http.Handler {
	return websocket.Handler(func(conn *websocket.Conn) {
		defer conn.Close()

		// Authenticate via query param or cookie
		token := conn.Request().URL.Query().Get("token")
		if token == "" {
			if c, err := conn.Request().Cookie("session"); err == nil {
				token = c.Value
			}
		}
		if token == "" {
			websocket.Message.Send(conn, `{"type":"error","payload":"token required"}`)
			return
		}
		if h.AuthFunc == nil {
			websocket.Message.Send(conn, `{"type":"error","payload":"auth not configured"}`)
			return
		}
		result, err := h.AuthFunc(token)
		if err != nil {
			websocket.Message.Send(conn, `{"type":"error","payload":"unauthorized"}`)
			return
		}

		channelSet := make(map[int64]bool, len(result.ChannelIDs))
		for _, id := range result.ChannelIDs {
			channelSet[id] = true
		}

		c := &client{
			conn:       conn,
			userID:     result.UserID,
			isBot:      result.IsBot,
			channelIDs: channelSet,
		}
		h.register(c)
		defer h.unregister(c)

		websocket.Message.Send(conn, `{"type":"connected"}`)

		// Read loop — parse and dispatch client events
		for {
			var msg string
			if err := websocket.Message.Receive(conn, &msg); err != nil {
				return
			}
			h.handleClientMessage(c, msg)
		}
	})
}

// Broadcast sends an event to all connected clients.
// Bot clients only receive events from their bound channels.
// DM channel events are only sent to the two participants.
func (h *Hub) Broadcast(ev Event) {
	data, err := json.Marshal(ev)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	msg := string(data)

	// Check if this is a DM channel
	h.dmMu.RLock()
	dmUsers, isDM := h.dmChans[ev.ChannelID]
	h.dmMu.RUnlock()

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		// Filter: exclude specific user (e.g., typing indicator sender)
		if ev.ExcludeUserID != 0 && c.userID == ev.ExcludeUserID {
			continue
		}
		// Filter: bot clients only get events from bound channels
		if c.isBot && ev.ChannelID > 0 && !c.channelIDs[ev.ChannelID] {
			continue
		}
		// Filter: DM events only go to participants
		if isDM && c.userID != dmUsers[0] && c.userID != dmUsers[1] {
			continue
		}
		if err := websocket.Message.Send(c.conn, msg); err != nil {
			log.Printf("ws: send error: %v", err)
		}
	}
}

// RegisterDMChannel registers a DM channel for broadcast filtering.
func (h *Hub) RegisterDMChannel(channelID, user1ID, user2ID int64) {
	h.dmMu.Lock()
	h.dmChans[channelID] = [2]int64{user1ID, user2ID}
	h.dmMu.Unlock()
}

// LoadDMChannels bulk-loads all DM channels (called on startup).
func (h *Hub) LoadDMChannels(channels map[int64][2]int64) {
	h.dmMu.Lock()
	h.dmChans = channels
	h.dmMu.Unlock()
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// clientMessage is the JSON structure for client-to-server events.
type clientMessage struct {
	Type      string `json:"type"`
	ChannelID int64  `json:"channelId"`
	ParentID  *int64 `json:"parentId"` // pointer to distinguish null from 0
}

func (h *Hub) handleClientMessage(c *client, raw string) {
	// Ignore messages from bots
	if c.isBot {
		return
	}

	var msg clientMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		return // silently ignore malformed messages
	}

	switch msg.Type {
	case "typing":
		h.broadcastTyping(c, msg.ChannelID, msg.ParentID)
	}
	// Unknown types are silently ignored
}

func (h *Hub) broadcastTyping(c *client, channelID int64, parentID *int64) {
	if channelID == 0 {
		return
	}

	// Rate limit: 2s per user+channel+parent
	var parentVal int64
	if parentID != nil {
		parentVal = *parentID
	}
	key := fmt.Sprintf("%d:%d:%d", c.userID, channelID, parentVal)

	h.typingMu.Lock()
	if last, ok := h.typingLast[key]; ok && time.Since(last) < 2*time.Second {
		h.typingMu.Unlock()
		return
	}
	h.typingLast[key] = time.Now()
	h.typingMu.Unlock()

	// Look up display name
	displayName := ""
	if h.GetDisplayNameFunc != nil {
		displayName = h.GetDisplayNameFunc(c.userID)
	}
	if displayName == "" {
		displayName = "Someone"
	}

	payload := map[string]interface{}{
		"channelId":   channelID,
		"parentId":    parentID,
		"userId":      c.userID,
		"displayName": displayName,
	}

	h.Broadcast(Event{
		Type:          "user_typing",
		Payload:       payload,
		ChannelID:     channelID,
		ExcludeUserID: c.userID,
	})
}

// RefreshBotPermissions updates the channel IDs for all connected bot clients with the given userID.
// This should be called when a bot's channel bindings are modified.
func (h *Hub) RefreshBotPermissions(botUserID int64) {
	if h.GetChannelIDsFunc == nil {
		return
	}

	channelIDs, err := h.GetChannelIDsFunc(botUserID)
	if err != nil {
		log.Printf("ws: failed to refresh bot permissions for user %d: %v", botUserID, err)
		return
	}

	channelSet := make(map[int64]bool, len(channelIDs))
	for _, id := range channelIDs {
		channelSet[id] = true
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		if c.isBot && c.userID == botUserID {
			c.channelIDs = channelSet
			log.Printf("ws: refreshed permissions for bot user %d: %d channels", botUserID, len(channelIDs))
		}
	}
}
