// Package notifications handles notification delivery via webhooks.
package notifications

import (
	"github.com/ebrakke/relay-chat/internal/db"
)

// Service handles notification delivery via webhooks.
type Service struct {
	db *db.DB
}

// Settings represents user notification preferences.
type Settings struct {
	UserID              int64  `json:"userId"`
	WebhookURL          string `json:"webhookUrl"`
	BaseURL             string `json:"baseUrl"`
	NotifyMentions      bool   `json:"notifyMentions"`
	NotifyThreadReplies bool   `json:"notifyThreadReplies"`
	NotifyAllMessages   bool   `json:"notifyAllMessages"`
	CreatedAt           string `json:"createdAt"`
	UpdatedAt           string `json:"updatedAt"`
}

// NewService creates a new notification service.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}
