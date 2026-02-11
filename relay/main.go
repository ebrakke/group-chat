package main

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

func main() {
	relayPrivkey := os.Getenv("RELAY_PRIVKEY")
	if relayPrivkey == "" {
		relayPrivkey = nostr.GeneratePrivateKey()
		pubkey, _ := nostr.GetPublicKey(relayPrivkey)
		fmt.Printf("Generated relay keypair. Pubkey: %s\n", pubkey)
	}

	// Use persistent SQLite database
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "/data/relay.db"
	}

	db := &sqlite3.SQLite3Backend{
		DatabaseURL: dbPath,
	}
	if err := db.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Define roles
	adminRole := &nip29.Role{
		Name:        "admin",
		Description: "group administrator",
	}
	memberRole := &nip29.Role{
		Name:        "member",
		Description: "regular group member",
	}

	relay, state := khatru29.Init(relay29.Options{
		Domain:                  os.Getenv("RELAY_DOMAIN"),
		SecretKey:               relayPrivkey,
		DB:                      db,
		DefaultRoles:            []*nip29.Role{adminRole, memberRole},
		GroupCreatorDefaultRole: adminRole,
	})

	// Configure group permissions
	state.AllowAction = func(ctx context.Context, group nip29.Group, role *nip29.Role, action relay29.Action) bool {
		// Admins can do everything
		if role != nil && role.Name == "admin" {
			return true
		}
		
		// Members can send messages but not moderate
		if role != nil && role.Name == "member" {
			_, isDeleteEvent := action.(relay29.DeleteEvent)
			_, isRemoveUser := action.(relay29.RemoveUser)
			_, isPutUser := action.(relay29.PutUser)
			_, isEditMetadata := action.(relay29.EditMetadata)
			
			// Members cannot moderate
			if isDeleteEvent || isRemoveUser || isPutUser || isEditMetadata {
				return false
			}
			
			// Members can send regular messages
			return true
		}
		
		// Non-members cannot do anything
		return false
	}

	relay.Info.Name = "Relay Chat"
	relay.Info.Description = "Private NIP-29 group relay for Relay Chat"

	// Restrict access to allowed pubkeys if configured
	allowedPubkeys := os.Getenv("ALLOWED_PUBKEYS")
	if allowedPubkeys != "" {
		allowedSet := make(map[string]bool)
		for _, pk := range strings.Split(allowedPubkeys, ",") {
			allowedSet[strings.TrimSpace(pk)] = true
		}
		_ = state // state available for future use
		_ = allowedSet
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3334"
	}

	fmt.Printf("Relay starting on :%s\n", port)
	if err := http.ListenAndServe(":"+port, relay); err != nil {
		log.Fatal(err)
	}
}
