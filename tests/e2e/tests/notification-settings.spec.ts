import { test, expect } from "@playwright/test";

const ADMIN_USER = "notif-admin";
const ADMIN_PASS = "adminpass123";
const ADMIN_DISPLAY = "Notif Admin";

const MEMBER_USER = "notif-member";
const MEMBER_PASS = "memberpass123";
const MEMBER_DISPLAY = "Notif Member";

test.describe.serial("Notification Settings Flow", () => {
  let inviteCode: string;

  test("admin bootstraps and configures ntfy server URL", async ({ page }) => {
    await page.goto("/");

    // Bootstrap admin account
    await expect(page.locator("text=Create Admin Account")).toBeVisible();
    await page.fill("#username", ADMIN_USER);
    await page.fill("#displayName", ADMIN_DISPLAY);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    // Should be logged in
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings page
    const settingsBtn = page.locator("#open-settings-btn");
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Should see settings page
    await expect(page.locator("text=Settings")).toBeVisible({ timeout: 5000 });

    // Scroll to ntfy section
    const ntfySection = page.locator("h3:has-text('Push Notifications')");
    await expect(ntfySection).toBeVisible({ timeout: 5000 });
    await ntfySection.scrollIntoViewIfNeeded();

    // Fill in ntfy server URL
    const ntfyUrlInput = page.locator("#ntfy-server-url");
    await expect(ntfyUrlInput).toBeVisible({ timeout: 5000 });
    await ntfyUrlInput.fill("https://ntfy.example.com");

    // Save ntfy settings
    await page.click("#save-ntfy-settings");

    // Should see success message
    await expect(page.locator("text=ntfy settings saved")).toBeVisible({ timeout: 5000 });
  });

  test("admin creates invite for member", async ({ page }) => {
    // Login as admin
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings page
    const settingsBtn = page.locator("#open-settings-btn");
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Create invite
    const createInviteBtn = page.locator("#admin-create-invite");
    await expect(createInviteBtn).toBeVisible({ timeout: 5000 });
    await createInviteBtn.click();

    // Get invite code
    const codeEl = page.locator("#admin-invite-result .invite-code, .invite-code").first();
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    const inviteUrl = (await codeEl.textContent()) || "";
    inviteCode = inviteUrl.match(/\/invite\/([a-f0-9]+)/i)?.[1] || "";
    expect(inviteCode).toBeTruthy();
  });

  test("member signs up and sees notification preferences", async ({ page }) => {
    expect(inviteCode).toBeTruthy();

    await page.goto(`/invite/${inviteCode}`);

    // Should see signup form
    await expect(page.locator("#signup-card")).toBeVisible();

    // Fill in member details
    await page.fill("#signup-username", MEMBER_USER);
    await page.fill("#signup-display", MEMBER_DISPLAY);
    await page.fill("#signup-password", MEMBER_PASS);
    await page.click("#signup-submit");

    // Should be logged in
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings
    const settingsBtn = page.locator("#open-settings-btn");
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Should see notification checkboxes (no Pushover key input)
    await expect(page.locator("#notify-mentions")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#notify-thread-replies")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#notify-all-messages")).toBeVisible({ timeout: 5000 });

    // Should NOT see Pushover inputs
    await expect(page.locator("#pushover-key")).not.toBeVisible();
    await expect(page.locator("#pushover-app-token")).not.toBeVisible();
  });

  test("member can save notification preferences", async ({ page }) => {
    // Login as member
    await page.goto("/");
    await page.fill("#username", MEMBER_USER);
    await page.fill("#password", MEMBER_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings
    const settingsBtn = page.locator("#open-settings-btn");
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Set preferences
    await page.check("#notify-mentions");
    await page.check("#notify-thread-replies");

    // Save settings
    await page.click("#save-notifications");

    // Should see success message
    await expect(page.locator("text=Notification settings saved successfully")).toBeVisible({ timeout: 5000 });
  });
});
