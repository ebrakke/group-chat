# Quick Verification Steps

After deploying the fix to production (chat.brakke.cc), verify the textarea works:

## Manual Testing (5 seconds)

1. Open https://chat.brakke.cc in your browser
2. Login (or use existing session)
3. Click the textarea at the bottom that says "Message #general"
4. Start typing

**Expected result:** Text appears in the textarea as you type ✅

## Mobile Testing

1. Open https://chat.brakke.cc on your phone
2. Login
3. Tap the textarea
4. Keyboard should appear immediately
5. Type a message

**Expected result:** Keyboard appears, typing works ✅

## Automated Test (if you have Playwright)

```bash
# Install Playwright (if not already installed)
npm install -D @playwright/test
npx playwright install

# Run the test
npx playwright test test-textarea.spec.ts
```

The test will:
- Load chat.brakke.cc
- Wait for the textarea to be visible
- Click the textarea
- Type "Hello from Playwright test!"
- Verify the text appears

## What Was Fixed

Before: Invisible overlay blocked clicks → textarea couldn't receive focus or input
After: Overlay has `pointer-events-none` → clicks pass through to textarea

## Rollback (if needed)

If something breaks:
```bash
git revert HEAD~1
git push
fly deploy --app relay-chat-frontend
```

---

**Current status:**
- ✅ Fix committed to master
- ✅ Frontend builds successfully
- ⏳ Awaiting deployment to Fly.io

Once deployed, the textarea will work immediately — no cache clearing or page refresh needed (CSS change applies instantly).
