// Echo bot — connects to Relay Chat via WebSocket and echoes back
// any message that @mentions it.
//
// Usage:
//   go run ./examples/echo-bot \
//     -url ws://localhost:8080/ws \
//     -token <bot-token> \
//     -username echo-bot
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/websocket"
)

var (
	wsURL    = flag.String("url", "ws://localhost:8080/ws", "WebSocket URL")
	apiBase  = flag.String("api", "http://localhost:8080", "API base URL")
	token    = flag.String("token", "", "Bot token (required)")
	username = flag.String("username", "echo-bot", "Bot username (for @mention matching)")
)

type wsEvent struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type message struct {
	ID        int64    `json:"id"`
	ChannelID int64    `json:"channelId"`
	UserID    int64    `json:"userId"`
	ParentID  *int64   `json:"parentId,omitempty"`
	Content   string   `json:"content"`
	Username  string   `json:"username"`
	IsBot     bool     `json:"isBot,omitempty"`
	Mentions  []string `json:"mentions,omitempty"`
}

func main() {
	flag.Parse()
	if *token == "" {
		log.Fatal("--token is required")
	}

	log.Printf("Echo bot starting (username=%s)", *username)

	for {
		if err := run(); err != nil {
			log.Printf("Connection error: %v — reconnecting in 3s", err)
			time.Sleep(3 * time.Second)
		}
	}
}

func run() error {
	url := *wsURL + "?token=" + *token
	conn, err := websocket.Dial(url, "", "http://localhost")
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	log.Println("Connected to WebSocket")

	for {
		var raw string
		if err := websocket.Message.Receive(conn, &raw); err != nil {
			return fmt.Errorf("receive: %w", err)
		}

		var ev wsEvent
		if err := json.Unmarshal([]byte(raw), &ev); err != nil {
			continue
		}

		switch ev.Type {
		case "connected":
			log.Println("Authenticated OK")
		case "new_message":
			var msg message
			if err := json.Unmarshal(ev.Payload, &msg); err != nil {
				continue
			}
			handleMessage(msg)
		case "new_reply":
			var msg message
			if err := json.Unmarshal(ev.Payload, &msg); err != nil {
				continue
			}
			handleMessage(msg)
		}
	}
}

func handleMessage(msg message) {
	// Don't respond to our own messages
	if msg.IsBot && msg.Username == *username {
		return
	}

	// Check if we're mentioned
	mentioned := false
	for _, m := range msg.Mentions {
		if strings.EqualFold(m, *username) {
			mentioned = true
			break
		}
	}
	if !mentioned {
		return
	}

	log.Printf("Mentioned by @%s in channel %d: %s", msg.Username, msg.ChannelID, msg.Content)

	// Strip the @mention and echo the rest
	content := msg.Content
	content = strings.ReplaceAll(content, "@"+*username, "")
	content = strings.TrimSpace(content)
	if content == "" {
		content = "You mentioned me, but didn't say anything."
	} else {
		content = fmt.Sprintf("echo: %s", content)
	}

	// Reply in the same channel (or thread if it was a reply)
	if msg.ParentID != nil {
		postReply(*msg.ParentID, content)
	} else {
		postMessage(msg.ChannelID, content)
	}
}

func postMessage(channelID int64, content string) {
	url := fmt.Sprintf("%s/api/channels/%d/messages", *apiBase, channelID)
	body, _ := json.Marshal(map[string]string{"content": content})

	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+*token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("POST error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("POST %s → %d: %s", url, resp.StatusCode, string(b))
	} else {
		log.Printf("Echoed to channel %d", channelID)
	}
}

func postReply(parentID int64, content string) {
	url := fmt.Sprintf("%s/api/messages/%d/reply", *apiBase, parentID)
	body, _ := json.Marshal(map[string]string{"content": content})

	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+*token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("POST error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("POST %s → %d: %s", url, resp.StatusCode, string(b))
	} else {
		log.Printf("Replied to thread %d", parentID)
	}
}
