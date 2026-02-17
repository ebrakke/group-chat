package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/ebrakke/relay-chat/internal/api"
	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/bots"
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
	"github.com/ebrakke/relay-chat/internal/notifications"
	"github.com/ebrakke/relay-chat/internal/reactions"
	internalrelay "github.com/ebrakke/relay-chat/internal/relay"
	"github.com/ebrakke/relay-chat/internal/ws"
)

//go:embed static/*
var staticFS embed.FS

func main() {
	port := envOr("PORT", "8080")
	dbPath := envOr("DATABASE_PATH", filepath.Join(dataDir(), "app.db"))
	relayDBPath := envOr("RELAY_DATABASE_PATH", filepath.Join(dataDir(), "relay.db"))

	// Ensure data directory exists
	os.MkdirAll(filepath.Dir(dbPath), 0755)

	// Open app database (runs migrations)
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	// Services
	authSvc := auth.NewService(database)
	botSvc := bots.NewService(database)
	chanSvc := channels.NewService(database)
	msgSvc := messages.NewService(database)
	reactSvc := reactions.NewService(database)
	notifySvc := notifications.NewService(database)

	// Register webhook provider (always available)
	notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

	// Register Pushover provider if configured
	pushoverToken, err := notifySvc.GetAppSetting("pushover_app_token")
	if err == nil && pushoverToken != "" {
		notifySvc.RegisterProvider("pushover", notifications.NewPushoverProvider(pushoverToken))
		log.Printf("Pushover provider enabled")
	}

	// Set notification callback on message service
	msgSvc.SetNotifyFunc(func(msg *messages.Message, channelName string) {
		if err := notifySvc.Send(msg, channelName); err != nil {
			log.Printf("Notification error: %v", err)
		}
	})

	// Ensure #general exists
	if _, err := chanSvc.EnsureGeneral(); err != nil {
		log.Printf("Warning: could not ensure #general channel: %v", err)
	}

	// Create NIP-29 relay handler
	relayHandler, err := internalrelay.New(internalrelay.Config{
		DatabasePath: relayDBPath,
	})
	if err != nil {
		log.Fatalf("Failed to initialize relay: %v", err)
	}

	// WebSocket hub
	hub := ws.NewHub()
	hub.AuthFunc = func(token string) (*ws.AuthResult, error) {
		// Try session token first
		user, err := authSvc.ValidateSession(token)
		if err == nil {
			return &ws.AuthResult{UserID: user.ID}, nil
		}
		// Try bot token
		user, err = botSvc.ValidateToken(token)
		if err == nil {
			channelIDs, _ := botSvc.GetBoundChannelIDs(user.ID)
			return &ws.AuthResult{UserID: user.ID, IsBot: true, ChannelIDs: channelIDs}, nil
		}
		return nil, fmt.Errorf("unauthorized")
	}
	hub.GetChannelIDsFunc = func(userID int64) ([]int64, error) {
		return botSvc.GetBoundChannelIDs(userID)
	}

	// API handler
	apiHandler := api.New(authSvc, botSvc, chanSvc, msgSvc, reactSvc, notifySvc, hub)

	// Build mux
	mux := http.NewServeMux()

	// /api/* -> JSON API
	mux.Handle("/api/", apiHandler)

	// /ws -> websocket hub
	mux.Handle("/ws", hub.Handler())

	// /relay -> NIP-29 relay (websocket)
	mux.Handle("/relay", relayHandler)
	mux.Handle("/relay/", relayHandler)

	// / -> SPA static assets
	staticSub, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("Failed to create static sub FS: %v", err)
	}
	mux.Handle("/", spaHandler(staticSub))

	addr := "0.0.0.0:" + port
	log.Printf("Relay Chat starting on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// spaHandler serves static files, falling back to index.html for SPA routing.
// Hashed assets (app.XXXX.js, style.XXXX.css) get long-lived cache headers.
// index.html and sw.js are never cached so updates propagate immediately.
func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Try to open the file
		f, err := fsys.Open(path)
		if err != nil {
			// File not found -> serve index.html for SPA routing
			w.Header().Set("Cache-Control", "no-cache")
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()

		// Cache-Control based on file type
		if path == "index.html" || path == "sw.js" {
			w.Header().Set("Cache-Control", "no-cache")
		} else if strings.Contains(path, ".") && (strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css")) {
			// Hashed assets are immutable
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		fileServer.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func dataDir() string {
	if d := os.Getenv("DATA_DIR"); d != "" {
		return d
	}
	return "/data"
}

func init() {
	// Print a banner
	fmt.Println("Relay Chat - unified binary")
}
