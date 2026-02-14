import { test, expect } from "@playwright/test";

const ADMIN_USER = "testadmin";
const ADMIN_PASS = "adminpass123";
const ADMIN_DISPLAY = "Test Admin";

const MEMBER_USER = "testmember";
const MEMBER_PASS = "memberpass123";
const MEMBER_DISPLAY = "Test Member";

test.describe.serial("Full E2E flow", () => {
  let inviteCode: string;

  test("bootstrap admin account", async ({ page }) => {
    await page.goto("/");

    // Should see the bootstrap/setup screen
    await expect(page.locator("text=Create Admin Account")).toBeVisible();

    // Fill in admin details
    await page.fill("#username", ADMIN_USER);
    await page.fill("#displayName", ADMIN_DISPLAY);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    // Should be logged in and see channels sidebar with #general
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".channel-list li", { hasText: "general" })).toBeVisible();
    await expect(page.locator(`text=${ADMIN_DISPLAY}`)).toBeVisible();
  });

  test("admin creates invite", async ({ page }) => {
    // Login as admin
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    // Open admin panel
    await expect(page.locator("#toggle-admin")).toBeVisible({ timeout: 5000 });
    await page.click("#toggle-admin");

    // Should see create invite button
    await expect(page.locator("#create-invite")).toBeVisible({ timeout: 5000 });
    await page.click("#create-invite");

    // Should see invite code
    const codeEl = page.locator(".invite-code");
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    inviteCode = (await codeEl.textContent()) || "";
    expect(inviteCode.trim().length).toBeGreaterThan(0);
  });

  test("member accepts invite and sees #general", async ({ page }) => {
    expect(inviteCode).toBeTruthy();

    await page.goto("/");

    // Fill in signup form
    await page.fill("#invite-code", inviteCode.trim());
    await page.fill("#signup-username", MEMBER_USER);
    await page.fill("#signup-display", MEMBER_DISPLAY);
    await page.fill("#signup-password", MEMBER_PASS);
    await page.click("#signup-submit");

    // Should be logged in and see #general in channel list
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".channel-list li", { hasText: "general" })).toBeVisible();
    await expect(page.locator(`text=${MEMBER_DISPLAY}`)).toBeVisible();
  });

  test("member can logout and login", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", MEMBER_USER);
    await page.fill("#password", MEMBER_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Logout
    await page.click("#logout");

    // Should see login form
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: 5000 });
  });

  test("user A posts message, user B sees it via WS", async ({ browser }) => {
    // Open two browser contexts (two separate users)
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Login user A (admin)
    await pageA.goto("/");
    await pageA.fill("#username", ADMIN_USER);
    await pageA.fill("#password", ADMIN_PASS);
    await pageA.click("#submit");
    await expect(pageA.locator("#channel-header")).toHaveText("# general", { timeout: 5000 });

    // Login user B (member)
    await pageB.goto("/");
    await pageB.fill("#username", MEMBER_USER);
    await pageB.fill("#password", MEMBER_PASS);
    await pageB.click("#submit");
    await expect(pageB.locator("#channel-header")).toHaveText("# general", { timeout: 5000 });

    // User A sends a message
    await pageA.fill("#msg-input", "Hello from Admin!");
    await pageA.click("#msg-send");

    // User A should see it
    await expect(pageA.locator(".message .msg-body", { hasText: "Hello from Admin!" })).toBeVisible({ timeout: 5000 });

    // User B should see it via WebSocket
    await expect(pageB.locator(".message .msg-body", { hasText: "Hello from Admin!" })).toBeVisible({ timeout: 5000 });

    // User B opens thread and replies
    await pageB.locator(".reply-btn").first().click();
    await expect(pageB.locator("#thread-panel")).toBeVisible({ timeout: 3000 });

    await pageB.fill("#reply-input", "Reply from Member!");
    await pageB.click("#reply-send");

    // User B should see thread reply
    await expect(pageB.locator(".thread-replies .msg-body", { hasText: "Reply from Member!" })).toBeVisible({ timeout: 5000 });

    // User A should see the reply count update via WS
    await expect(pageA.locator(".reply-btn", { hasText: "(1)" })).toBeVisible({ timeout: 5000 });

    // User A opens thread to verify
    await pageA.locator(".reply-btn").first().click();
    await expect(pageA.locator("#thread-panel")).toBeVisible({ timeout: 3000 });
    await expect(pageA.locator(".thread-replies .msg-body", { hasText: "Reply from Member!" })).toBeVisible({ timeout: 5000 });

    await ctxA.close();
    await ctxB.close();
  });
});
