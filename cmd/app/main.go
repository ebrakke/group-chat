package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/ebrakke/relay-chat/internal/api"
	"github.com/ebrakke/relay-chat/internal/auth"
	"github.com/ebrakke/relay-chat/internal/bots"
	"github.com/ebrakke/relay-chat/internal/calendar"
	"github.com/ebrakke/relay-chat/internal/channels"
	"github.com/ebrakke/relay-chat/internal/db"
	"github.com/ebrakke/relay-chat/internal/files"
	"github.com/ebrakke/relay-chat/internal/messages"
	"github.com/ebrakke/relay-chat/internal/notifications"
	"github.com/ebrakke/relay-chat/internal/reactions"
	"github.com/ebrakke/relay-chat/internal/search"
	internalrelay "github.com/ebrakke/relay-chat/internal/relay"
	"github.com/ebrakke/relay-chat/internal/ws"
)

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

//go:embed all:static
var staticFS embed.FS

func main() {
	// Check for --version / -v flag
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("relay-chat %s (commit: %s, built: %s)\n", version, commit, buildTime)
		return
	}

	// Check for CLI commands
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		handleResetPassword()
		return
	}

	port := envOr("PORT", "8080")
	baseURL := envOr("BASE_URL", "http://localhost:8080")
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
	calSvc := calendar.NewService(database)

	// Dev mode: auto-bootstrap admin/admin user if no users exist
	if os.Getenv("DEV_MODE") == "true" {
		hasUsers, err := authSvc.HasUsers()
		if err == nil && !hasUsers {
			_, _, err := authSvc.Bootstrap("admin", "admin", "Dev Admin")
			if err != nil {
				log.Printf("Dev mode: failed to auto-bootstrap admin user: %v", err)
			} else {
				log.Printf("Dev mode: auto-bootstrapped admin/admin user")
			}
		}
	}
	msgSvc := messages.NewService(database)
	reactSvc := reactions.NewService(database)
	uploadDir := filepath.Join(dataDir(), "uploads")
	maxUploadSize := int64(10 << 20) // 10MB
	fileSvc := files.NewService(database, uploadDir, maxUploadSize)
	searchSvc := search.NewService(database)
	notifySvc := notifications.NewService(database, baseURL)

	// Register webhook provider (always available)
	notifySvc.RegisterProvider("webhook", notifications.NewWebhookProvider())

	// Register ntfy provider if configured
	ntfyURL, err := notifySvc.GetAppSetting("ntfy_server_url")
	if err == nil && ntfyURL != "" {
		notifySvc.RegisterProvider("ntfy", notifications.NewNtfyProvider(ntfyURL))
		log.Printf("Ntfy provider enabled: %s", ntfyURL)
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
	defer relayHandler.Close()

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
	apiHandler := api.New(authSvc, botSvc, chanSvc, calSvc, msgSvc, reactSvc, notifySvc, fileSvc, searchSvc, version, hub)

	// Build mux
	mux := http.NewServeMux()

	// /api/* -> JSON API
	mux.Handle("/api/", apiHandler)

	// /up -> ONCE health check
	mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// /-/pre-backup -> flush stores for ONCE backup (localhost only)
	mux.HandleFunc("GET /-/pre-backup", func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if host != "127.0.0.1" && host != "::1" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if _, err := database.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
			log.Printf("pre-backup: WAL checkpoint failed: %v", err)
			http.Error(w, "checkpoint failed", http.StatusInternalServerError)
			return
		}
		if err := relayHandler.Sync(); err != nil {
			log.Printf("pre-backup: Badger sync failed: %v", err)
			http.Error(w, "sync failed", http.StatusInternalServerError)
			return
		}
		log.Printf("pre-backup: stores flushed successfully")
		w.WriteHeader(http.StatusOK)
	})

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

func handleResetPassword() {
	if len(os.Args) != 4 {
		fmt.Println("Usage: relay-chat reset-password <username> <new-password>")
		os.Exit(1)
	}

	username := os.Args[2]
	newPassword := os.Args[3]

	dbPath := envOr("DATABASE_PATH", filepath.Join(dataDir(), "app.db"))
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	authSvc := auth.NewService(database)
	if err := authSvc.ResetPasswordByUsername(username, newPassword); err != nil {
		log.Fatalf("Failed to reset password: %v", err)
	}

	fmt.Printf("Password reset successfully for user '%s'\n", username)
}

func dataDir() string {
	if d := os.Getenv("DATA_DIR"); d != "" {
		return d
	}
	return "/data"
}

func init() {
	fmt.Printf("Relay Chat %s\n", version)
}
