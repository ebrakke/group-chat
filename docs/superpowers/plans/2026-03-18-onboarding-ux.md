# Onboarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR code login, PWA install prompt, and improved invite visibility for a unified onboarding experience.

**Architecture:** Three independent features sharing the same branch. QR login adds a transfer token system (Go) + QR rendering (frontend). PWA install prompt is a pure frontend component. Invite visibility modifies bootstrap flow (Go + frontend) and sidebar (frontend).

**Tech Stack:** Go, SQLite, SvelteKit 5, `qrcode` npm package

**Spec:** `docs/superpowers/specs/2026-03-18-onboarding-ux-design.md`

---

## File Structure

### New Files
- `internal/db/migrations/020_transfer_tokens.sql` — Migration for transfer_tokens table
- `internal/auth/transfer.go` — Transfer token CRUD (create, validate, cleanup)
- `internal/auth/transfer_test.go` — Tests for transfer tokens
- `frontend/src/lib/components/InstallBanner.svelte` — PWA install prompt component
- `frontend/src/routes/welcome/+page.svelte` — Post-bootstrap welcome page with invite link

### Modified Files
- `internal/api/api.go` — New handlers: transfer-token, transfer endpoint; modify handleBootstrap to create invite
- `cmd/app/main.go` — Register `GET /auth/transfer/{token}` route on the main mux
- `frontend/src/lib/stores/auth.svelte.ts` — Add `bootstrapInviteCode` state, update bootstrap method
- `frontend/src/routes/bootstrap/+page.svelte` — Redirect to `/welcome` instead of `/channels`
- `frontend/src/routes/+layout.svelte` — Add `/welcome` to public routes
- `frontend/src/routes/(app)/+layout.svelte` — Add InstallBanner component
- `frontend/src/routes/(app)/settings/+page.svelte` — Add QR code login section
- `frontend/src/lib/components/Sidebar.svelte` — Add invite link for admins
- `frontend/package.json` — Add `qrcode` dependency

---

### Task 1: Database Migration — Transfer Tokens

**Files:**
- Create: `internal/db/migrations/020_transfer_tokens.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS transfer_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_tokens_token ON transfer_tokens(token);
```

- [ ] **Step 2: Commit**

```bash
git add internal/db/migrations/020_transfer_tokens.sql
git commit -m "feat: add transfer_tokens migration (020)"
```

---

### Task 2: Transfer Token Backend — Create, Validate, Cleanup

**Files:**
- Create: `internal/auth/transfer.go`
- Create: `internal/auth/transfer_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/auth/transfer_test.go
package auth

import (
	"testing"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func bootstrapTestUser(t *testing.T, svc *Service) *User {
	t.Helper()
	user, _, err := svc.Bootstrap("testadmin", "password123", "Test Admin")
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	return user
}

func TestCreateTransferToken(t *testing.T) {
	svc := NewService(setupTestDB(t))
	user := bootstrapTestUser(t, svc)

	token, err := svc.CreateTransferToken(user.ID)
	if err != nil {
		t.Fatalf("CreateTransferToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if len(token) != 64 { // 32 bytes = 64 hex chars
		t.Fatalf("expected 64 char token, got %d", len(token))
	}
}

func TestCreateTransferToken_CleansUpOldTokens(t *testing.T) {
	svc := NewService(setupTestDB(t))
	user := bootstrapTestUser(t, svc)

	token1, _ := svc.CreateTransferToken(user.ID)
	token2, _ := svc.CreateTransferToken(user.ID)

	if token1 == token2 {
		t.Fatal("expected different tokens")
	}

	// First token should be invalid now
	_, err := svc.ValidateTransferToken(token1)
	if err == nil {
		t.Fatal("expected first token to be invalid after generating second")
	}
}

func TestValidateTransferToken(t *testing.T) {
	svc := NewService(setupTestDB(t))
	user := bootstrapTestUser(t, svc)

	token, _ := svc.CreateTransferToken(user.ID)

	// Valid token returns user ID
	userID, err := svc.ValidateTransferToken(token)
	if err != nil {
		t.Fatalf("ValidateTransferToken: %v", err)
	}
	if userID != user.ID {
		t.Fatalf("expected user ID %d, got %d", user.ID, userID)
	}

	// Token is consumed — second use should fail
	_, err = svc.ValidateTransferToken(token)
	if err == nil {
		t.Fatal("expected error on second use of token")
	}
}

func TestValidateTransferToken_Expired(t *testing.T) {
	svc := NewService(setupTestDB(t))
	user := bootstrapTestUser(t, svc)

	// Insert an already-expired token directly
	expiredAt := time.Now().Add(-1 * time.Minute).UTC().Format(time.RFC3339)
	svc.db.Exec(
		"INSERT INTO transfer_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
		user.ID, "expiredtoken", expiredAt, time.Now().UTC().Format(time.RFC3339),
	)

	_, err := svc.ValidateTransferToken("expiredtoken")
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidateTransferToken_InvalidToken(t *testing.T) {
	svc := NewService(setupTestDB(t))

	_, err := svc.ValidateTransferToken("nonexistent")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/dev/code/relay-chat && go test ./internal/auth/ -run TestCreateTransfer -v`
Expected: FAIL — `CreateTransferToken` not defined

- [ ] **Step 3: Implement transfer.go**

```go
// internal/auth/transfer.go
package auth

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const transferTokenDuration = 5 * time.Minute

// CreateTransferToken generates a one-time login token for the given user.
// Cleans up any existing tokens for this user and expired tokens globally.
func (s *Service) CreateTransferToken(userID int64) (string, error) {
	// Clean up: delete existing tokens for this user + all expired tokens
	s.db.Exec("DELETE FROM transfer_tokens WHERE user_id = ?", userID)
	s.db.Exec("DELETE FROM transfer_tokens WHERE expires_at < ?", time.Now().UTC().Format(time.RFC3339))

	token, err := randomHex(32)
	if err != nil {
		return "", fmt.Errorf("generate transfer token: %w", err)
	}

	expiresAt := time.Now().Add(transferTokenDuration).UTC().Format(time.RFC3339)
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = s.db.Exec(
		"INSERT INTO transfer_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
		userID, token, expiresAt, now,
	)
	if err != nil {
		return "", fmt.Errorf("insert transfer token: %w", err)
	}

	return token, nil
}

// ValidateTransferToken validates and consumes a one-time transfer token.
// Returns the associated user ID, or an error if invalid/expired/used.
// The token is deleted regardless of outcome (consumed or expired).
func (s *Service) ValidateTransferToken(token string) (int64, error) {
	var userID int64
	var expiresAt string

	err := s.db.QueryRow(
		"SELECT user_id, expires_at FROM transfer_tokens WHERE token = ?",
		token,
	).Scan(&userID, &expiresAt)

	if errors.Is(err, sql.ErrNoRows) {
		return 0, errors.New("invalid or expired transfer token")
	}
	if err != nil {
		return 0, fmt.Errorf("query transfer token: %w", err)
	}

	// Always delete the token (single use)
	s.db.Exec("DELETE FROM transfer_tokens WHERE token = ?", token)

	// Check expiration
	expires, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil || time.Now().After(expires) {
		return 0, errors.New("invalid or expired transfer token")
	}

	// Verify user still exists
	var exists int
	s.db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", userID).Scan(&exists)
	if exists == 0 {
		return 0, errors.New("invalid or expired transfer token")
	}

	return userID, nil
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/auth/ -run "TestCreateTransfer|TestValidateTransfer" -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add internal/auth/transfer.go internal/auth/transfer_test.go
git commit -m "feat: add transfer token create/validate/cleanup"
```

---

### Task 3: API Endpoints — Transfer Token + Transfer Redirect

**Files:**
- Modify: `internal/api/api.go` — add handlers and route
- Modify: `cmd/app/main.go` — register `/auth/transfer/` on main mux

- [ ] **Step 1: Add transfer-token API route**

In `internal/api/api.go`, add to the route registration section (after the existing auth routes around line 75):

```go
	h.mux.HandleFunc("POST /api/auth/transfer-token", h.requireAuthMiddleware(h.handleCreateTransferToken))
```

- [ ] **Step 2: Add handleCreateTransferToken handler**

```go
func (h *Handler) handleCreateTransferToken(w http.ResponseWriter, r *http.Request) {
	user, err := h.requireAuth(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	token, err := h.auth.CreateTransferToken(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, errors.New("failed to create transfer token"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}
```

- [ ] **Step 3: Add handleTransfer handler**

This handler will be registered on the main mux, not the API handler. Add it as a method on Handler but export a standalone function that `main.go` can use:

```go
func (h *Handler) HandleTransfer(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, "Gone", http.StatusGone)
		return
	}

	userID, err := h.auth.ValidateTransferToken(token)
	if err != nil {
		http.Error(w, "Gone", http.StatusGone)
		return
	}

	// Create a session for this user
	sessionToken, err := h.auth.CreateSessionForUser(userID)
	if err != nil {
		http.Error(w, "Gone", http.StatusGone)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	setSessionCookie(w, sessionToken)
	http.Redirect(w, r, "/channels", http.StatusFound)
}
```

Note: `CreateSessionForUser` doesn't exist yet — we need to expose the `createSession` method. In `internal/auth/auth.go`, add a public wrapper:

```go
// CreateSessionForUser creates a new session for the given user ID.
func (s *Service) CreateSessionForUser(userID int64) (string, error) {
	return s.createSession(userID)
}
```

- [ ] **Step 4: Register the transfer route in main.go**

In `cmd/app/main.go`, add before the SPA handler (before `mux.Handle("/", spaHandler(staticSub))`):

```go
	// /auth/transfer/{token} -> QR code session transfer
	mux.HandleFunc("GET /auth/transfer/{token}", apiHandler.HandleTransfer)
```

- [ ] **Step 5: Fix Secure cookie flag**

Update `setSessionCookie` in `api.go` to set `Secure: true` when not in dev mode. The handler already has access to check this. Simplest approach — check if the request came over HTTPS:

Actually, the simplest approach is to check an environment variable. Update `setSessionCookie`:

```go
func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 3600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("DEV_MODE") != "true",
	})
}
```

Add `"os"` to imports if not already present.

- [ ] **Step 6: Verify build**

Run: `go build ./...` (ignore embed error)
Run: `go test ./internal/auth/ -v` and `go test ./internal/api/ -v`

- [ ] **Step 7: Commit**

```bash
git add internal/api/api.go internal/auth/auth.go cmd/app/main.go
git commit -m "feat: add transfer token API and QR session transfer endpoint"
```

---

### Task 4: Modify Bootstrap to Create Invite

**Files:**
- Modify: `internal/api/api.go` — update `handleBootstrap` to create an invite and return the code

- [ ] **Step 1: Update handleBootstrap**

Find the existing `handleBootstrap` handler. After the successful bootstrap call, create an invite and include the code in the response.

Replace the last two lines of `handleBootstrap`:
```go
	setSessionCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"user": user, "token": token})
```

With:
```go
	setSessionCookie(w, token)

	// Auto-create an invite for the new admin to share
	invite, err := h.auth.CreateInvite(user.ID, nil, nil)
	var inviteCode string
	if err == nil && invite != nil {
		inviteCode = invite.Code
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"user":       user,
		"token":      token,
		"inviteCode": inviteCode,
	})
```

- [ ] **Step 2: Verify build**

Run: `go build ./internal/...`

- [ ] **Step 3: Commit**

```bash
git add internal/api/api.go
git commit -m "feat: auto-create invite on bootstrap, return code in response"
```

---

### Task 5: Frontend — Auth Store + Welcome Page + Bootstrap Redirect

**Files:**
- Modify: `frontend/src/lib/stores/auth.svelte.ts`
- Create: `frontend/src/routes/welcome/+page.svelte`
- Modify: `frontend/src/routes/bootstrap/+page.svelte`
- Modify: `frontend/src/routes/+layout.svelte`

- [ ] **Step 1: Update auth store to capture invite code**

In `frontend/src/lib/stores/auth.svelte.ts`, add a new state field and update `bootstrap()`:

Add after `hasUsers = $state(true);`:
```typescript
  bootstrapInviteCode = $state('');
```

Update `bootstrap()` to capture the invite code:
```typescript
  async bootstrap(username: string, password: string, displayName: string) {
    const res = await api<{ user: User; token: string; inviteCode: string }>('POST', '/api/auth/bootstrap', {
      username,
      password,
      displayName
    });
    this.user = res.user;
    this.hasUsers = true;
    this.bootstrapInviteCode = res.inviteCode || '';
  }
```

- [ ] **Step 2: Update bootstrap page to redirect to /welcome**

In `frontend/src/routes/bootstrap/+page.svelte`, change line 17:

From: `goto('/channels');`
To: `goto('/welcome');`

- [ ] **Step 3: Add /welcome to public routes**

In `frontend/src/routes/+layout.svelte`, update the `publicRoutes` array:

From: `const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite'];`
To: `const publicRoutes = ['/login', '/bootstrap', '/signup', '/invite', '/welcome'];`

- [ ] **Step 4: Create welcome page**

```svelte
<!-- frontend/src/routes/welcome/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';

  let copied = $state(false);

  // If no invite code (direct navigation or refresh), go to channels
  if (!authStore.bootstrapInviteCode) {
    goto('/channels');
  }

  const inviteUrl = $derived(
    authStore.bootstrapInviteCode
      ? `${window.location.origin}/invite/${authStore.bootstrapInviteCode}`
      : ''
  );

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  function goToChat() {
    authStore.bootstrapInviteCode = '';
    goto('/channels');
  }
</script>

<div class="flex items-center justify-center min-h-screen font-mono"
     style="background: var(--background); color: var(--foreground);">
  <div class="w-full max-w-sm p-8 text-center">
    <div class="mb-2">
      <span class="text-[18px] font-bold tracking-tight">relay</span><span class="text-[18px]" style="color: var(--rc-timestamp);">.chat</span>
    </div>
    <p class="text-[14px] mb-6" style="color: var(--foreground);">your chat is ready!</p>
    <p class="text-[12px] mb-4" style="color: var(--rc-timestamp);">share this link to invite your team</p>

    <div class="flex items-center gap-2 mb-6">
      <input
        type="text"
        readonly
        value={inviteUrl}
        class="flex-1 px-3 py-2 border text-[11px] font-mono outline-none truncate"
        style="background: var(--rc-input-bg); border-color: var(--border); color: var(--foreground);"
      />
      <button
        onclick={copyLink}
        class="px-3 py-2 text-[12px] font-mono border shrink-0 transition-colors"
        style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--rc-channel-active-bg);"
      >{copied ? 'copied!' : 'copy'}</button>
    </div>

    <button
      onclick={goToChat}
      class="text-[12px] hover:underline underline-offset-2"
      style="color: var(--rc-timestamp);"
    >go to chat &rarr;</button>
  </div>
</div>
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd frontend && bun run build`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add welcome page with invite link after bootstrap"
```

---

### Task 6: Frontend — QR Code Login on Settings Page

**Files:**
- Modify: `frontend/package.json` — add `qrcode` dependency
- Modify: `frontend/src/routes/(app)/settings/+page.svelte` — add QR section

- [ ] **Step 1: Install qrcode package**

Run: `cd frontend && bun add qrcode && bun add -d @types/qrcode`

- [ ] **Step 2: Add QR login section to settings page**

In `frontend/src/routes/(app)/settings/+page.svelte`, add in the script section (at the top, with other imports):

```typescript
  import QRCode from 'qrcode';
```

Add state variables (with other state declarations):

```typescript
  // QR login
  let qrDataUrl = $state('');
  let qrLoading = $state(false);
  let qrError = $state('');
  let qrRefreshTimer: ReturnType<typeof setInterval> | null = null;

  async function generateQR() {
    qrLoading = true;
    qrError = '';
    try {
      const { token } = await api<{ token: string }>('POST', '/api/auth/transfer-token');
      const url = `${window.location.origin}/auth/transfer/${token}`;
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (e: any) {
      qrError = 'Failed to generate QR code';
    } finally {
      qrLoading = false;
    }
  }

  function startQRRefresh() {
    generateQR();
    qrRefreshTimer = setInterval(generateQR, 4 * 60 * 1000); // 4 minutes

    // Pause/resume on visibility change
    document.addEventListener('visibilitychange', handleVisibility);
  }

  function stopQRRefresh() {
    if (qrRefreshTimer) clearInterval(qrRefreshTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
  }

  function handleVisibility() {
    if (document.hidden) {
      if (qrRefreshTimer) clearInterval(qrRefreshTimer);
    } else {
      generateQR();
      qrRefreshTimer = setInterval(generateQR, 4 * 60 * 1000);
    }
  }
```

In the `onMount`, add:
```typescript
    startQRRefresh();
```

In `onDestroy` (add one if it doesn't exist):
```typescript
    stopQRRefresh();
```

Add the QR section in the template, after the password change section and before the admin-only sections. Look for a natural break point (e.g., before the `{#if authStore.isAdmin}` block):

```svelte
    <!-- QR Login -->
    <div class="border-t pt-4 mt-4" style="border-color: var(--border);">
      <h3 class="text-[13px] font-bold mb-1">log in on another device</h3>
      <p class="text-[11px] mb-3" style="color: var(--rc-timestamp);">scan this QR code with your phone to log in instantly</p>
      {#if qrLoading && !qrDataUrl}
        <div class="w-[200px] h-[200px] border flex items-center justify-center"
             style="border-color: var(--border);">
          <span class="text-[11px]" style="color: var(--rc-timestamp);">generating...</span>
        </div>
      {:else if qrError}
        <p class="text-[11px]" style="color: var(--rc-mention-badge);">{qrError}</p>
      {:else if qrDataUrl}
        <img src={qrDataUrl} alt="QR code for mobile login" class="w-[200px] h-[200px]" />
        {#if qrLoading}
          <p class="text-[10px] mt-1" style="color: var(--rc-timestamp);">refreshing...</p>
        {/if}
      {/if}
    </div>
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && bun run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add QR code login section to settings page"
```

---

### Task 7: Frontend — PWA Install Banner

**Files:**
- Create: `frontend/src/lib/components/InstallBanner.svelte`
- Modify: `frontend/src/routes/(app)/+layout.svelte`

- [ ] **Step 1: Create InstallBanner component**

```svelte
<!-- frontend/src/lib/components/InstallBanner.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let deferredPrompt: any = $state(null);
  let dismissed = $state(false);
  let isStandalone = $state(false);

  onMount(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isStandalone = true;
      return;
    }

    // Check if recently dismissed
    const dismissedAt = localStorage.getItem('install-banner-dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      dismissed = true;
      return;
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
    });
  });

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      dismissed = true;
    }
  }

  function dismiss() {
    localStorage.setItem('install-banner-dismissed', String(Date.now()));
    dismissed = true;
  }

  const show = $derived(deferredPrompt && !dismissed && !isStandalone);
</script>

{#if show}
  <div class="flex items-center justify-between px-3 py-2 text-[12px] font-mono border-b z-50"
       style="background: var(--rc-channel-active-bg); color: var(--rc-channel-active-fg); border-color: var(--border);">
    <span>install relay chat for the best experience</span>
    <div class="flex items-center gap-2 shrink-0 ml-2">
      <button
        onclick={install}
        class="px-2 py-0.5 border text-[11px] hover:opacity-80"
        style="border-color: var(--rc-channel-active-fg);"
      >install</button>
      <button
        onclick={dismiss}
        class="hover:opacity-60 p-0.5"
        aria-label="Dismiss"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Add InstallBanner to app layout**

In `frontend/src/routes/(app)/+layout.svelte`, add import:
```typescript
  import InstallBanner from '$lib/components/InstallBanner.svelte';
```

Add the component just inside the main wrapper div, before the sidebar:
```svelte
  <InstallBanner />
```

Place it right after the opening `<div class="flex h-screen ...">` tag, before the sidebar div.

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && bun run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add PWA install banner for mobile browsers"
```

---

### Task 8: Frontend — Sidebar Invite Link

**Files:**
- Modify: `frontend/src/lib/components/Sidebar.svelte`

- [ ] **Step 1: Add invite link to sidebar**

In `frontend/src/lib/components/Sidebar.svelte`, find the admin button (around line 148-155). Add an "invite" button right after it, inside the same `{#if authStore.isAdmin}` block:

```svelte
    {#if authStore.isAdmin}
      <button
        id="toggle-admin"
        onclick={() => { goto('/settings'); onCloseSidebar?.(); }}
        class="text-left text-[12px] hover:underline underline-offset-2 py-1"
        style="color: var(--rc-timestamp);"
      >admin</button>
      <button
        id="open-invites"
        onclick={() => { goto('/settings'); onCloseSidebar?.(); }}
        class="text-left text-[12px] hover:underline underline-offset-2 py-1"
        style="color: var(--rc-timestamp);"
      >+ invite</button>
    {/if}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && bun run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/components/Sidebar.svelte
git commit -m "feat: add invite link to sidebar for admins"
```

---

### Task 9: Full Build + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `make build`
Expected: Frontend + Go binary build successfully

- [ ] **Step 2: Verify all Go tests pass**

Run: `go test ./... -count=1`
Expected: All pass

- [ ] **Step 3: Start server and test QR flow**

Run: `make dev` (background)
Then:
- Log in as admin
- Go to Settings — should see QR code
- `curl -X POST http://localhost:8080/api/auth/transfer-token -H "Cookie: session=<your-cookie>"` — should return `{"token":"..."}`
- Open `http://localhost:8080/auth/transfer/<token>` in incognito — should redirect to `/channels` with a session

- [ ] **Step 4: Test bootstrap welcome flow**

- Clear the database and restart
- Go through bootstrap
- Should redirect to `/welcome` with an invite link
- Copy link works
- "Go to chat" navigates to `/channels`

- [ ] **Step 5: Test install banner**

- Open on mobile (or Chrome DevTools mobile simulation)
- `beforeinstallprompt` fires → banner appears
- Dismiss → stored in localStorage, doesn't reappear

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
