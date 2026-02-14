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

    // Should be logged in and see channels
    await expect(page.locator("text=Channels")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=general")).toBeVisible();
    await expect(page.locator(`text=${ADMIN_DISPLAY}`)).toBeVisible();
  });

  test("admin creates invite", async ({ page }) => {
    // Login as admin
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    // Should see admin section with create invite button
    await expect(page.locator("#create-invite")).toBeVisible({ timeout: 5000 });

    // Create invite
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

    // Should be logged in and see #general
    await expect(page.locator("text=Channels")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=general")).toBeVisible();
    await expect(page.locator(`text=${MEMBER_DISPLAY}`)).toBeVisible();
  });

  test("member can logout and login", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", MEMBER_USER);
    await page.fill("#password", MEMBER_PASS);
    await page.click("#submit");

    await expect(page.locator("text=Channels")).toBeVisible({ timeout: 5000 });

    // Logout
    await page.click("#logout");

    // Should see login form
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: 5000 });
  });
});
