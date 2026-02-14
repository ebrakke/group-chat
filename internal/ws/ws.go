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
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type client struct {
	conn   *websocket.Conn
	userID int64
}

// Hub manages WebSocket connections and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	// AuthFunc validates a session token and returns the user ID. Set by the app.
	AuthFunc func(token string) (int64, error)
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
		userID, err := h.AuthFunc(token)
		if err != nil {
			websocket.Message.Send(conn, `{"type":"error","payload":"unauthorized"}`)
			return
		}

		c := &client{conn: conn, userID: userID}
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
