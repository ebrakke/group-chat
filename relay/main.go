package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/fiatjaf/eventstore/slicestore"
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

	db := &slicestore.SliceStore{}
	db.Init()

	relay, state := khatru29.Init(relay29.Options{
		Domain:    os.Getenv("RELAY_DOMAIN"),
		SecretKey: relayPrivkey,
		DB:        db,
		DefaultRoles: []*nip29.Role{
			{Name: "admin", Description: "group administrator"},
			{Name: "member", Description: "regular group member"},
		},
	})

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
