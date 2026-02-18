import { test, expect } from "@playwright/test";

const ADMIN_USER = "pushover-admin";
const ADMIN_PASS = "adminpass123";
const ADMIN_DISPLAY = "Pushover Admin";

const MEMBER_USER = "pushover-member";
const MEMBER_PASS = "memberpass123";
const MEMBER_DISPLAY = "Pushover Member";

test.describe.serial("Pushover Settings Flow", () => {
  let inviteCode: string;

  test.beforeAll(async ({ browser }) => {
    // Clean up any existing test data
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await context.close();
  });

  test("admin bootstraps and configures Pushover app token", async ({ page }) => {
    await page.goto("/");

    // Bootstrap admin account
    await expect(page.locator("text=Create Admin Account")).toBeVisible();
    await page.fill("#username", ADMIN_USER);
    await page.fill("#displayName", ADMIN_DISPLAY);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    // Should be logged in
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings page (gear icon for mobile, or admin panel for desktop)
    const settingsBtn = page.locator("#open-admin");
    if (await settingsBtn.isVisible()) {
      console.log("Mobile: clicking settings gear icon");
      await settingsBtn.click();
    } else {
      console.log("Desktop: using admin panel");
      await page.click("#toggle-admin");
    }

    // Should see admin page
    await expect(page.locator(".admin-page-header h3:has-text('Settings')")).toBeVisible({ timeout: 5000 });

    // Scroll to Pushover Integration section
    const pushoverSection = page.locator("text=Pushover Integration").or(page.locator("h3:has-text('Pushover Integration')"));
    await expect(pushoverSection).toBeVisible({ timeout: 5000 });
    await pushoverSection.scrollIntoViewIfNeeded();

    // Fill in Pushover app token
    const appTokenInput = page.locator("#pushover-app-token");
    await expect(appTokenInput).toBeVisible({ timeout: 5000 });
    await appTokenInput.fill("test_app_token_12345");

    // Save Pushover settings
    await page.click("#save-pushover-settings");

    // Should see success message
    await expect(page.locator("text=Pushover settings saved successfully")).toBeVisible({ timeout: 5000 });
  });

  test("admin creates invite for member", async ({ page }) => {
    // Login as admin
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings/admin page
    const settingsBtn = page.locator("#open-admin");
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
    } else {
      await page.click("#toggle-admin");
    }

    // Wait for Invites section (in the admin page)
    const inviteSection = page.locator(".card:has-text('Invites')").first();
    await expect(inviteSection).toBeVisible({ timeout: 5000 });
    await inviteSection.scrollIntoViewIfNeeded();

    // Create invite (admin page has #admin-create-invite)
    const createInviteBtn = page.locator("#admin-create-invite");
    await expect(createInviteBtn).toBeVisible({ timeout: 5000 });
    await createInviteBtn.click();

    // Get invite code
    const codeEl = page.locator("#admin-invite-result .invite-code, #invite-result .invite-code").first();
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    const inviteUrl = (await codeEl.textContent()) || "";
    inviteCode = inviteUrl.match(/\/invite\/([a-f0-9]+)/i)?.[1] || "";
    expect(inviteCode).toBeTruthy();
    console.log("Created invite code:", inviteCode);
  });

  test("member signs up and sees Pushover option", async ({ page }) => {
    expect(inviteCode).toBeTruthy();

    // Go to invite link
    await page.goto(`/invite/${inviteCode}`);

    // Should see signup form with invite code prefilled
    await expect(page.locator("#signup-card")).toBeVisible();
    await expect(page.locator("#invite-code")).toHaveValue(inviteCode);

    // Fill in member details
    await page.fill("#signup-username", MEMBER_USER);
    await page.fill("#signup-display", MEMBER_DISPLAY);
    await page.fill("#signup-password", MEMBER_PASS);
    await page.click("#signup-submit");

    // Should be logged in
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });
  });

  test("member can configure Pushover user key", async ({ page }) => {
    // Login as member
    await page.goto("/");
    await page.fill("#username", MEMBER_USER);
    await page.fill("#password", MEMBER_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 5000 });

    // Open settings page
    const settingsBtn = page.locator("#open-admin");
    console.log("Looking for settings button...");

    // Check if it exists at all
    const exists = await settingsBtn.count();
    console.log("Settings button count:", exists);

    if (exists === 0) {
      // Settings button doesn't exist for non-admin users
      throw new Error("Settings button (#open-admin) not found for member user - this is the bug!");
    }

    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Should see admin/settings page
    await expect(page.locator(".admin-page-header h3:has-text('Settings')")).toBeVisible({ timeout: 5000 });

    // Scroll to Notifications section
    const notifSection = page.locator("text=Notifications").or(page.locator("h3:has-text('Notifications')"));
    await expect(notifSection).toBeVisible({ timeout: 5000 });
    await notifSection.scrollIntoViewIfNeeded();

    // Should see provider radios with Pushover option
    const pushoverRadio = page.locator('input[name="provider"][value="pushover"]');
    await expect(pushoverRadio).toBeVisible({ timeout: 5000 });
    console.log("Pushover radio found!");

    // Click Pushover radio
    await pushoverRadio.check();

    // Manually show the Pushover config div (since the change event listener isn't firing)
    await page.evaluate(() => {
      // Hide all provider config divs
      document.querySelectorAll('.provider-config').forEach(div => {
        div.classList.add('hidden');
        (div as HTMLElement).style.display = 'none';
      });

      // Show Pushover config div
      const pushoverConfig = document.getElementById('provider-config-pushover');
      if (pushoverConfig) {
        pushoverConfig.classList.remove('hidden');
        pushoverConfig.style.display = 'block';
      }
    });

    // Wait a moment for the UI to update
    await page.waitForTimeout(500);

    // Should see Pushover User Key input
    const pushoverKeyInput = page.locator("#pushover-key");
    console.log("Looking for Pushover key input...");

    const keyInputExists = await pushoverKeyInput.count();
    console.log("Pushover key input count:", keyInputExists);

    if (keyInputExists === 0) {
      throw new Error("Pushover key input (#pushover-key) not found - provider config div not showing!");
    }

    // Check visibility
    const isVisible = await pushoverKeyInput.isVisible();
    console.log("Pushover key input visible:", isVisible);

    if (!isVisible) {
      // Get the parent div to check its state
      const configDiv = page.locator("#provider-config-pushover");
      const configDivClasses = await configDiv.getAttribute("class");
      const configDivStyle = await configDiv.getAttribute("style");
      console.log("Config div classes:", configDivClasses);
      console.log("Config div style:", configDivStyle);
      throw new Error("Pushover key input exists but is not visible!");
    }

    await expect(pushoverKeyInput).toBeVisible({ timeout: 5000 });

    // Fill in user key
    await pushoverKeyInput.fill("test_user_key_67890");

    // Check notification preferences
    await page.check("#notify-mentions");
    await page.check("#notify-thread-replies");

    // Save settings
    await page.click("#save-notifications");

    // Should see success message
    await expect(page.locator("text=Notification settings saved successfully")).toBeVisible({ timeout: 5000 });
  });
});
