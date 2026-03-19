// Package relay provides an importable NIP-29 group relay handler.
// It wraps the khatru29 relay so it can be mounted under a path in the app mux.
package relay

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	badgerdb "github.com/dgraph-io/badger/v4"
	"github.com/fiatjaf/eventstore/badger"
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

// Relay wraps the NIP-29 relay handler and its underlying Badger store.
type Relay struct {
	handler http.Handler
	db      *badger.BadgerBackend
}

func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.handler.ServeHTTP(w, req)
}

func (r *Relay) Sync() error {
	return r.db.Sync()
}

func (r *Relay) Close() {
	r.db.Close()
}

// New creates and returns a configured relay http.Handler.
func New(cfg Config) (*Relay, error) {
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
		dbPath = os.Getenv("RELAY_DATABASE_PATH")
	}
	if dbPath == "" {
		dataDir := os.Getenv("DATA_DIR")
		if dataDir == "" {
			dataDir = "/data"
		}
		dbPath = filepath.Join(dataDir, "relay.db")
	}
	// Badger uses a directory; use dir of the config path + "relay" (e.g. ./tmp/relay)
	relayDir := filepath.Join(filepath.Dir(dbPath), "relay")
	if err := os.MkdirAll(relayDir, 0755); err != nil {
		return nil, fmt.Errorf("relay data dir: %w", err)
	}

	db := &badger.BadgerBackend{
		Path: relayDir,
		BadgerOptionsModifier: func(opts badgerdb.Options) badgerdb.Options {
			return opts.WithBypassLockGuard(true)
		},
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

	log.Printf("NIP-29 relay initialized (domain=%s, db=%s)", domain, relayDir)
	return &Relay{handler: r, db: db}, nil
}
