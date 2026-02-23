// internal/notifications/provider.go
package notifications

import "context"

// Provider delivers notifications via a specific channel (Pushover, webhook, etc.)
type Provider interface {
	// Send delivers a notification for a message
	Send(ctx context.Context, recipient Recipient, payload Payload) error

	// ValidateConfig checks if provider is properly configured
	ValidateConfig() error
}

// Recipient identifies who receives the notification
type Recipient struct {
	UserID      int64
	ProviderKey string // ntfy topic, webhook URL, etc.
}

// Payload contains notification content
type Payload struct {
	Title            string
	Message          string
	Sender           string
	Channel          string
	ChannelID        int64
	URL              string
	Timestamp        string
	NotificationType string
	ThreadContext    string
}
