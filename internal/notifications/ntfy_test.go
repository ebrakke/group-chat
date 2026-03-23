package notifications

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerateNtfyTopic(t *testing.T) {
	topic := generateNtfyTopic()
	if !strings.HasPrefix(topic, "relay-") {
		t.Errorf("topic should start with 'relay-', got: %s", topic)
	}
	if len(topic) < 20 {
		t.Errorf("topic should be at least 20 chars (relay- + uuid), got: %d", len(topic))
	}

	// Topics should be unique
	topic2 := generateNtfyTopic()
	if topic == topic2 {
		t.Error("two generated topics should not be equal")
	}
}

func TestPublishNtfy(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(200)
	}))
	defer server.Close()

	payload := Payload{
		Title:     "Test Title",
		Message:   "Test message",
		Sender:    "Alice",
		MessageID: 42,
		URL:       "https://example.com/#/channel/1",
	}

	err := publishNtfy(server.URL, "", "relay-test-topic", payload, "https://example.com/icon-192.png")
	if err != nil {
		t.Fatalf("publishNtfy failed: %v", err)
	}

	if receivedBody["topic"] != "relay-test-topic" {
		t.Errorf("expected topic 'relay-test-topic', got: %v", receivedBody["topic"])
	}
	if receivedBody["title"] != "Test Title" {
		t.Errorf("expected title 'Test Title', got: %v", receivedBody["title"])
	}
	if receivedAuth != "" {
		t.Errorf("expected no auth header for empty token, got: %s", receivedAuth)
	}
}

func TestPublishNtfyWithToken(t *testing.T) {
	var receivedAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(200)
	}))
	defer server.Close()

	payload := Payload{Title: "Test", Message: "msg", Sender: "Bob", MessageID: 1}
	err := publishNtfy(server.URL, "tk_mytoken", "topic", payload, "")
	if err != nil {
		t.Fatalf("publishNtfy failed: %v", err)
	}

	if receivedAuth != "Bearer tk_mytoken" {
		t.Errorf("expected 'Bearer tk_mytoken', got: %s", receivedAuth)
	}
}

func TestPublishNtfyServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer server.Close()

	payload := Payload{Title: "Test", Message: "msg", Sender: "Bob", MessageID: 1}
	err := publishNtfy(server.URL, "", "topic", payload, "")
	if err == nil {
		t.Error("expected error for 500 response")
	}
}
