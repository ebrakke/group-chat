import { test, expect, devices } from "@playwright/test";

const ADMIN_USER = "mobileadmin";
const ADMIN_PASS = "adminpass123";
const ADMIN_DISPLAY = "Mobile Admin";

const MEMBER_USER = "mobilemember";
const MEMBER_PASS = "memberpass123";
const MEMBER_DISPLAY = "Mobile Member";

const iPhone = devices["iPhone 13"];

test.use({
  ...iPhone,
});

test.describe.serial("Mobile UX Audit", () => {
  let inviteCode: string;

  test("bootstrap screen on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "screenshots/01-bootstrap-mobile.png", fullPage: true });

    // Check viewport fitting
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`Bootstrap: body=${bodyWidth}, viewport=${viewportWidth}`);

    // Check inputs have proper font-size (>=16px to avoid iOS zoom)
    const inputFontSize = await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]');
      return input ? getComputedStyle(input).fontSize : 'not found';
    });
    console.log(`Input font-size: ${inputFontSize}`);

    // Check monospace font
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    console.log(`Body font: ${bodyFont}`);

    // Fill and submit
    await page.fill("#username", ADMIN_USER);
    await page.fill("#displayName", ADMIN_DISPLAY);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 10000 });
  });

  test("main chat - composer stays on screen", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(500);
    await page.screenshot({ path: "screenshots/02-main-chat-mobile.png", fullPage: false });

    // CRITICAL: Is the composer on screen?
    const composer = page.locator("#composer");
    const composerBox = await composer.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    console.log(`Composer box: ${JSON.stringify(composerBox)}`);
    console.log(`Viewport height: ${viewportHeight}`);

    if (composerBox) {
      const isOnScreen = composerBox.y + composerBox.height <= viewportHeight + 5;
      console.log(`Composer on screen: ${isOnScreen}`);
      expect(isOnScreen).toBe(true);
    }

    // Check no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`ScrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("composer stays on screen after many messages", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header-text")).toHaveText("# general", { timeout: 10000 });

    // Send many messages
    for (let i = 1; i <= 10; i++) {
      await page.fill("#msg-input", `Test message ${i} for layout check`);
      await page.click("#msg-send");
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: "screenshots/03-messages-many-mobile.png", fullPage: false });

    // CRITICAL: Composer must still be visible
    const composerBox = await page.locator("#composer").boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    console.log(`After 10 msgs - composer box: ${JSON.stringify(composerBox)}`);

    if (composerBox) {
      const isOnScreen = composerBox.y + composerBox.height <= viewportHeight + 5;
      console.log(`Composer on screen: ${isOnScreen}`);
      expect(isOnScreen).toBe(true);
    }
  });

  test("sidebar on mobile", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 10000 });

    // Open sidebar
    await page.click("#sidebar-toggle");
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/04-sidebar-mobile.png", fullPage: false });

    // Check backdrop is visible
    const backdrop = page.locator("#sidebar-backdrop");
    await expect(backdrop).toBeVisible();

    // Admin section should be hidden in sidebar on mobile
    const adminSection = page.locator(".admin-section");
    const adminVisible = await adminSection.isVisible();
    console.log(`Admin section in sidebar (should be hidden on mobile): ${adminVisible}`);
    expect(adminVisible).toBe(false);
  });

  test("admin settings page on mobile", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 10000 });

    // Settings button should be visible
    const settingsBtn = page.locator("#open-admin");
    await expect(settingsBtn).toBeVisible();

    // Open admin page
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/05-admin-page-mobile.png", fullPage: false });

    // Admin page should be visible
    const adminPage = page.locator("#admin-page");
    await expect(adminPage).toBeVisible();

    // Create invite button should be accessible
    const createBtn = page.locator("#admin-create-invite");
    await expect(createBtn).toBeVisible();

    // Create an invite
    await createBtn.click();
    const codeEl = page.locator("#admin-invite-result .invite-code");
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    const inviteUrl = (await codeEl.textContent()) || "";
    const match = inviteUrl.trim().match(/\/invite\/([a-f0-9]+)$/i);
    expect(match).toBeTruthy();
    inviteCode = match![1];
    console.log(`Invite code: ${inviteCode}`);

    await page.screenshot({ path: "screenshots/06-admin-invite-created.png", fullPage: false });

    // Close admin page
    await page.click("#close-admin");
    await expect(adminPage).toBeHidden();
  });

  test("login screen with tabs", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "screenshots/07-login-tabs-mobile.png", fullPage: false });

    // Login tab should be active by default
    const loginTab = page.locator('.auth-tab[data-tab="login"]');
    const signupTab = page.locator('.auth-tab[data-tab="signup"]');
    await expect(loginTab).toBeVisible();
    await expect(signupTab).toBeVisible();

    // Login card should be visible, signup card hidden
    await expect(page.locator("#login-card")).toBeVisible();
    await expect(page.locator("#signup-card")).toBeHidden();

    // Switch to signup tab
    await signupTab.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "screenshots/08-signup-tab-mobile.png", fullPage: false });

    await expect(page.locator("#login-card")).toBeHidden();
    await expect(page.locator("#signup-card")).toBeVisible();

    // Login button should be within viewport (not below fold)
    const signupBtn = page.locator("#signup-submit");
    const signupBox = await signupBtn.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    console.log(`Signup button box: ${JSON.stringify(signupBox)}`);
    if (signupBox) {
      // Should be visible within viewport
      console.log(`Signup button on screen: ${signupBox.y + signupBox.height <= viewportHeight}`);
    }
  });

  test("signup via invite works", async ({ page }) => {
    expect(inviteCode).toBeTruthy();

    await page.goto("/");
    // Switch to signup tab
    await page.click('.auth-tab[data-tab="signup"]');
    await page.fill("#invite-code", inviteCode.trim());
    await page.fill("#signup-username", MEMBER_USER);
    await page.fill("#signup-display", MEMBER_DISPLAY);
    await page.fill("#signup-password", MEMBER_PASS);
    await page.click("#signup-submit");

    await expect(page.locator("#channel-header")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".user-info", { hasText: MEMBER_DISPLAY })).toBeVisible();
  });

  test("thread panel on mobile", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header-text")).toHaveText("# general", { timeout: 10000 });

    // Click reply on a message
    await page.locator(".reply-btn").first().click();
    await expect(page.locator("#thread-panel")).toBeVisible({ timeout: 3000 });

    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/09-thread-panel-mobile.png", fullPage: false });

    // Thread panel should cover full screen
    const threadBox = await page.locator("#thread-panel").boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`Thread panel width: ${threadBox?.width}, viewport: ${viewportWidth}`);

    // Reply input should be visible
    const replyBox = await page.locator("#reply-input").boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    if (replyBox) {
      const onScreen = replyBox.y + replyBox.height <= viewportHeight + 5;
      console.log(`Reply input on screen: ${onScreen}`);
      expect(onScreen).toBe(true);
    }

    // Close thread
    await page.click("#close-thread");
    await expect(page.locator("#thread-panel")).toBeHidden();
  });

  test("reaction picker on mobile", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header-text")).toHaveText("# general", { timeout: 10000 });

    // Open reaction picker
    const addBtn = page.locator(".reaction-add-btn").first();
    await addBtn.click();

    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/10-reaction-picker-mobile.png", fullPage: false });

    // Picker should fit on screen
    const pickerBox = await page.locator(".reaction-picker").boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`Picker box: ${JSON.stringify(pickerBox)}`);
    if (pickerBox) {
      expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewportWidth + 2);
    }
  });

  test("overall layout metrics", async ({ page }) => {
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header-text")).toHaveText("# general", { timeout: 10000 });

    const metrics = await page.evaluate(() => {
      const getRect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, top: r.top, bottom: r.bottom };
      };

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bodyScroll: { width: document.body.scrollWidth, height: document.body.scrollHeight },
        channelHeader: getRect('.channel-header'),
        messageList: getRect('.message-list'),
        composer: getRect('#composer'),
        mainPanel: getRect('.main-panel'),
        channelView: getRect('.channel-view'),
      };
    });

    console.log("=== MOBILE LAYOUT METRICS ===");
    console.log(JSON.stringify(metrics, null, 2));

    // Critical assertions
    const vp = metrics.viewport;

    // No horizontal overflow
    expect(metrics.bodyScroll.width).toBeLessThanOrEqual(vp.width + 2);

    // Composer should be within viewport
    if (metrics.composer) {
      expect(metrics.composer.bottom).toBeLessThanOrEqual(vp.height + 5);
    }

    // Main panel should not exceed viewport
    if (metrics.mainPanel) {
      expect(metrics.mainPanel.height).toBeLessThanOrEqual(vp.height + 2);
    }
  });
});
