package notifications

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

type WebPushSubscription struct {
	ID        int64  `json:"id"`
	Endpoint  string `json:"endpoint"`
	P256dh    string `json:"p256dh"`
	Auth      string `json:"auth"`
	UserAgent string `json:"userAgent"`
}

func (s *Service) EnsureVAPIDKeys() (string, string, error) {
	pub, pubErr := s.GetAppSetting("vapid_public_key")
	priv, privErr := s.GetAppSetting("vapid_private_key")

	if pubErr == nil && privErr == nil && pub != "" && priv != "" {
		return pub, priv, nil
	}

	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", fmt.Errorf("generate VAPID keys: %w", err)
	}

	err = s.UpdateAppSettings(map[string]string{
		"vapid_public_key":  pub,
		"vapid_private_key": priv,
	})
	if err != nil {
		return "", "", fmt.Errorf("store VAPID keys: %w", err)
	}

	log.Printf("Generated new VAPID keys")
	return pub, priv, nil
}

func (s *Service) GetVAPIDPublicKey() (string, error) {
	return s.GetAppSetting("vapid_public_key")
}

const maxSubscriptionsPerUser = 10

func (s *Service) SaveWebPushSubscription(userID int64, sub WebPushSubscription) error {
	var existingID int64
	err := s.db.QueryRow(
		`SELECT id FROM web_push_subscriptions WHERE endpoint = ? AND p256dh_key = ? AND auth_key = ?`,
		sub.Endpoint, sub.P256dh, sub.Auth,
	).Scan(&existingID)

	if err == nil {
		_, err = s.db.Exec(
			`UPDATE web_push_subscriptions SET user_id = ?, user_agent = ?, updated_at = ? WHERE id = ?`,
			userID, sub.UserAgent, time.Now().UTC().Format(time.RFC3339), existingID,
		)
		return err
	}

	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id = ?`, userID).Scan(&count)
	if count >= maxSubscriptionsPerUser {
		return fmt.Errorf("maximum of %d push subscriptions reached", maxSubscriptionsPerUser)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth, sub.UserAgent, now, now,
	)
	return err
}

func (s *Service) GetWebPushSubscriptions(userID int64) ([]WebPushSubscription, error) {
	rows, err := s.db.Query(
		`SELECT id, endpoint, p256dh_key, auth_key, user_agent FROM web_push_subscriptions WHERE user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []WebPushSubscription
	for rows.Next() {
		var sub WebPushSubscription
		if err := rows.Scan(&sub.ID, &sub.Endpoint, &sub.P256dh, &sub.Auth, &sub.UserAgent); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	return subs, rows.Err()
}

func (s *Service) DeleteWebPushSubscription(endpoint string) error {
	_, err := s.db.Exec(`DELETE FROM web_push_subscriptions WHERE endpoint = ?`, endpoint)
	return err
}

type webPushPayload struct {
	Title   string             `json:"title"`
	Options webPushPayloadOpts `json:"options"`
}

type webPushPayloadOpts struct {
	Body string             `json:"body"`
	Icon string             `json:"icon"`
	Data webPushPayloadData `json:"data"`
}

type webPushPayloadData struct {
	Path      string `json:"path"`
	ChannelID int64  `json:"channelId"`
	ThreadID  *int64 `json:"threadId"`
}

func (s *Service) SendWebPush(subs []WebPushSubscription, payload Payload) {
	vapidPub, pubErr := s.GetAppSetting("vapid_public_key")
	vapidPriv, privErr := s.GetAppSetting("vapid_private_key")
	if pubErr != nil || privErr != nil || vapidPub == "" || vapidPriv == "" {
		return
	}

	pushPayload := webPushPayload{
		Title: payload.Title,
		Options: webPushPayloadOpts{
			Body: fmt.Sprintf("%s: %s", payload.Sender, payload.Message),
			Icon: "/icon-192.png",
			Data: webPushPayloadData{
				Path:      payload.URL,
				ChannelID: payload.ChannelID,
			},
		},
	}

	payloadJSON, err := json.Marshal(pushPayload)
	if err != nil {
		log.Printf("web push: marshal payload: %v", err)
		return
	}

	subject := s.baseURL
	if configuredURL, err := s.GetAppSetting("base_url"); err == nil && configuredURL != "" {
		subject = configuredURL
	}

	for _, sub := range subs {
		go func(sub WebPushSubscription) {
			resp, err := webpush.SendNotification(payloadJSON, &webpush.Subscription{
				Endpoint: sub.Endpoint,
				Keys: webpush.Keys{
					P256dh: sub.P256dh,
					Auth:   sub.Auth,
				},
			}, &webpush.Options{
				VAPIDPublicKey:  vapidPub,
				VAPIDPrivateKey: vapidPriv,
				Subscriber:      subject,
				Urgency:         webpush.UrgencyHigh,
				HTTPClient:      &http.Client{Timeout: 10 * time.Second},
			})
			if err != nil {
				log.Printf("web push send error (endpoint %s): %v", sub.Endpoint[:min(50, len(sub.Endpoint))], err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusGone {
				log.Printf("web push: removing expired subscription %s", sub.Endpoint[:min(50, len(sub.Endpoint))])
				s.DeleteWebPushSubscription(sub.Endpoint)
			}
		}(sub)
	}
}
