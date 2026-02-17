// Package ws provides a WebSocket hub for real-time message broadcast.
package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"golang.org/x/net/websocket"
)

// Event is a message broadcast to connected clients.
type Event struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	ChannelID int64       `json:"-"` // used for bot filtering, not serialized
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
}

// NewHub creates a new WebSocket hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[*client]struct{}),
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

		// Read loop (discard incoming, just keep alive)
		for {
			var msg string
			if err := websocket.Message.Receive(conn, &msg); err != nil {
				return
			}
		}
	})
}

// Broadcast sends an event to all connected clients.
// Bot clients only receive events from their bound channels.
func (h *Hub) Broadcast(ev Event) {
	data, err := json.Marshal(ev)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	msg := string(data)

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		// Filter: bot clients only get events from bound channels
		if c.isBot && ev.ChannelID > 0 && !c.channelIDs[ev.ChannelID] {
			continue
		}
		if err := websocket.Message.Send(c.conn, msg); err != nil {
			log.Printf("ws: send error: %v", err)
		}
	}
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
