package ws

import (
	"testing"
)

func TestRefreshBotPermissions(t *testing.T) {
	hub := NewHub()

	// Set up mock GetChannelIDsFunc
	hub.GetChannelIDsFunc = func(userID int64) ([]int64, error) {
		if userID == 1 {
			return []int64{10, 20, 30}, nil
		}
		return []int64{}, nil
	}

	// Create a mock bot client
	c := &client{
		userID:     1,
		isBot:      true,
		channelIDs: map[int64]bool{10: true}, // Initially only has channel 10
	}
	hub.register(c)

	// Verify initial state
	if len(c.channelIDs) != 1 {
		t.Errorf("expected 1 channel initially, got %d", len(c.channelIDs))
	}
	if !c.channelIDs[10] {
		t.Error("expected channel 10 to be accessible")
	}

	// Refresh permissions
	hub.RefreshBotPermissions(1)

	// Verify updated state
	if len(c.channelIDs) != 3 {
		t.Errorf("expected 3 channels after refresh, got %d", len(c.channelIDs))
	}
	if !c.channelIDs[10] || !c.channelIDs[20] || !c.channelIDs[30] {
		t.Error("expected channels 10, 20, 30 to be accessible after refresh")
	}
}

func TestRefreshBotPermissionsMultipleClients(t *testing.T) {
	hub := NewHub()

	// Set up mock GetChannelIDsFunc
	callCount := 0
	hub.GetChannelIDsFunc = func(userID int64) ([]int64, error) {
		callCount++
		if userID == 1 {
			return []int64{100, 200}, nil
		}
		return []int64{}, nil
	}

	// Create multiple clients for the same bot
	c1 := &client{userID: 1, isBot: true, channelIDs: map[int64]bool{100: true}}
	c2 := &client{userID: 1, isBot: true, channelIDs: map[int64]bool{100: true}}
	// Different bot
	c3 := &client{userID: 2, isBot: true, channelIDs: map[int64]bool{999: true}}

	hub.register(c1)
	hub.register(c2)
	hub.register(c3)

	// Refresh permissions for bot 1
	hub.RefreshBotPermissions(1)

	// Verify both bot 1 clients were updated
	if len(c1.channelIDs) != 2 || !c1.channelIDs[100] || !c1.channelIDs[200] {
		t.Error("c1 should have channels 100 and 200")
	}
	if len(c2.channelIDs) != 2 || !c2.channelIDs[100] || !c2.channelIDs[200] {
		t.Error("c2 should have channels 100 and 200")
	}

	// Verify bot 2 client was NOT updated
	if len(c3.channelIDs) != 1 || !c3.channelIDs[999] {
		t.Error("c3 should still only have channel 999")
	}

	// Verify GetChannelIDsFunc was called only once
	if callCount != 1 {
		t.Errorf("expected GetChannelIDsFunc to be called once, got %d", callCount)
	}
}

func TestBroadcastWithBotFiltering(t *testing.T) {
	hub := NewHub()

	// Create a bot client with limited channels
	botClient := &client{
		userID:     1,
		isBot:      true,
		channelIDs: map[int64]bool{10: true, 20: true},
	}

	// Create a regular user client
	userClient := &client{
		userID:     2,
		isBot:      false,
		channelIDs: nil,
	}

	hub.register(botClient)
	hub.register(userClient)

	// Test that bot filtering logic exists
	// Note: We can't fully test broadcast without a real WebSocket connection,
	// but we can verify the clients are registered correctly
	hub.mu.RLock()
	clientCount := len(hub.clients)
	hub.mu.RUnlock()

	if clientCount != 2 {
		t.Errorf("expected 2 clients, got %d", clientCount)
	}
}
