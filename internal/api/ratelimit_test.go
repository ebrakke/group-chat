package api

import (
	"testing"
	"time"
)

func TestRateLimiterAllow(t *testing.T) {
	rl := newRateLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if !rl.allow("1.2.3.4") {
			t.Errorf("request %d should be allowed", i+1)
		}
	}
	if rl.allow("1.2.3.4") {
		t.Error("4th request should be blocked")
	}
	if !rl.allow("5.6.7.8") {
		t.Error("different IP should be allowed")
	}
}

func TestRateLimiterWindowReset(t *testing.T) {
	rl := newRateLimiter(1, 50*time.Millisecond)
	rl.allow("1.2.3.4")
	if rl.allow("1.2.3.4") {
		t.Error("should be blocked")
	}
	time.Sleep(60 * time.Millisecond)
	if !rl.allow("1.2.3.4") {
		t.Error("should be allowed after window reset")
	}
}
