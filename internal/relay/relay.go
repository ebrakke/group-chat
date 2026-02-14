// Package relay provides an importable NIP-29 group relay handler.
// It wraps the khatru29 relay so it can be mounted under a path in the app mux.
package relay

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/fiatjaf/eventstore/sqlite3"
	"github.com/fiatjaf/relay29"
	"github.com/fiatjaf/relay29/khatru29"
	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip29"
)

type Config struct {
	PrivateKey     string
	Domain         string
	DatabasePath   string
	AllowedPubkeys []string
}

// New creates and returns a configured relay http.Handler.
func New(cfg Config) (http.Handler, error) {
	privkey := cfg.PrivateKey
	if privkey == "" {
		privkey = os.Getenv("RELAY_PRIVKEY")
	}
	if privkey == "" {
		privkey = nostr.GeneratePrivateKey()
		pubkey, _ := nostr.GetPublicKey(privkey)
		fmt.Printf("Generated relay keypair. Pubkey: %s\n", pubkey)
	}

	dbPath := cfg.DatabasePath
	if dbPath == "" {
		dbPath = os.Getenv("DATABASE_PATH")
	}
	if dbPath == "" {
		dbPath = "/data/relay.db"
	}

	db := &sqlite3.SQLite3Backend{
		DatabaseURL: dbPath,
	}
	if err := db.Init(); err != nil {
		return nil, fmt.Errorf("relay db init: %w", err)
	}

	adminRole := &nip29.Role{Name: "admin", Description: "group administrator"}
	memberRole := &nip29.Role{Name: "member", Description: "regular group member"}

	domain := cfg.Domain
	if domain == "" {
		domain = os.Getenv("RELAY_DOMAIN")
	}
	if domain == "" {
		domain = "localhost"
	}

	r, state := khatru29.Init(relay29.Options{
		Domain:                 domain,
		SecretKey:              privkey,
		DB:                     db,
		DefaultRoles:           []*nip29.Role{adminRole, memberRole},
		GroupCreatorDefaultRole: adminRole,
	})

	state.AllowAction = func(ctx context.Context, group nip29.Group, role *nip29.Role, action relay29.Action) bool {
		if role != nil && role.Name == "admin" {
			return true
		}
		if role != nil && role.Name == "member" {
			_, isDeleteEvent := action.(relay29.DeleteEvent)
			_, isRemoveUser := action.(relay29.RemoveUser)
			_, isPutUser := action.(relay29.PutUser)
			_, isEditMetadata := action.(relay29.EditMetadata)
			if isDeleteEvent || isRemoveUser || isPutUser || isEditMetadata {
				return false
			}
			return true
		}
		return false
	}

	r.Info.Name = "Relay Chat"
	r.Info.Description = "Private NIP-29 group relay for Relay Chat"

	if len(cfg.AllowedPubkeys) == 0 {
		env := os.Getenv("ALLOWED_PUBKEYS")
		if env != "" {
			for _, pk := range strings.Split(env, ",") {
				cfg.AllowedPubkeys = append(cfg.AllowedPubkeys, strings.TrimSpace(pk))
			}
		}
	}

	log.Printf("NIP-29 relay initialized (domain=%s, db=%s)", domain, dbPath)
	return r, nil
}
