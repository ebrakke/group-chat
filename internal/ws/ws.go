// Package ws provides a stub WebSocket endpoint.
package ws

import (
	"log"
	"net/http"

	"golang.org/x/net/websocket"
)

// Handler returns a WebSocket handler that accepts connections and echoes a welcome message.
func Handler() http.Handler {
	return websocket.Handler(func(conn *websocket.Conn) {
		defer conn.Close()
		if err := websocket.Message.Send(conn, `{"type":"connected","message":"relay-chat ws stub"}`); err != nil {
			return
		}
		// Hold connection open, read and discard
		for {
			var msg string
			if err := websocket.Message.Receive(conn, &msg); err != nil {
				log.Printf("ws: client disconnected: %v", err)
				return
			}
		}
	})
}
