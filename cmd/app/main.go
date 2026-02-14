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
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/messages"
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
	chanSvc := channels.NewService(database)
	msgSvc := messages.NewService(database)

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
	hub.AuthFunc = func(token string) (int64, error) {
		user, err := authSvc.ValidateSession(token)
		if err != nil {
			return 0, err
		}
		return user.ID, nil
	}

	// API handler
	apiHandler := api.New(authSvc, chanSvc, msgSvc, hub)

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

	log.Printf("Relay Chat starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// spaHandler serves static files, falling back to index.html for SPA routing.
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
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}
		f.Close()
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
