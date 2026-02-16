/**
 * Prod-smoke E2E tests — run against an already-deployed preview URL.
 *
 * Usage:
 *   BASE_URL=https://relay-chat-pr-42.fly.dev bunx playwright test tests/prod-smoke.spec.ts
 *
 * The suite is self-contained: it bootstraps admin (if first-run),
 * creates an invite, signs up a member, then exercises the critical
 * messaging path (post in #general, open thread, reply).
 */

import { test, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Unique-per-run credentials (avoids conflicts across retries)      */
/* ------------------------------------------------------------------ */

const RUN_ID = Date.now().toString(36);
const ADMIN_USER = `smoke-admin-${RUN_ID}`;
const ADMIN_PASS = "SmokeAdm!n1";
const ADMIN_DISPLAY = `Smoke Admin ${RUN_ID}`;

const MEMBER_USER = `smoke-member-${RUN_ID}`;
const MEMBER_PASS = "SmokeMbr!1";
const MEMBER_DISPLAY = `Smoke Member ${RUN_ID}`;

/* ------------------------------------------------------------------ */

test.describe.serial("Prod smoke – critical path", () => {
  let inviteCode: string;

  test("bootstrap or login admin", async ({ page }) => {
    await page.goto("/");

    // Detect whether this is a fresh instance (bootstrap) or existing (login).
    const isBootstrap = await page
      .locator("text=Create Admin Account")
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isBootstrap) {
      await page.fill("#username", ADMIN_USER);
      await page.fill("#displayName", ADMIN_DISPLAY);
      await page.fill("#password", ADMIN_PASS);
      await page.click("#submit");
    } else {
      // Already bootstrapped — login as whatever admin was set up previously.
      // For preview deploys this shouldn't happen (fresh DB each deploy),
      // but handle it gracefully.
      await page.fill("#username", ADMIN_USER);
      await page.fill("#password", ADMIN_PASS);
      await page.click("#submit");
    }

    // Some preview envs are slow; wait for the composer as the true "chat is ready" signal.
    await expect(page.locator("#msg-input")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator(".channel-list li", { hasText: "general" })
    ).toBeVisible();
  });

  test("admin creates invite code", async ({ page }) => {
    // Login admin
    await page.goto("/");
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await page.click("#submit");
    await expect(page.locator("#toggle-admin")).toBeVisible({ timeout: 10_000 });

    // Open admin panel + create invite
    await page.click("#toggle-admin");
    await expect(page.locator("#create-invite")).toBeVisible({ timeout: 5000 });
    await page.click("#create-invite");

    const codeEl = page.locator("#invite-result .invite-code");
    await expect(codeEl).toBeVisible({ timeout: 5000 });
    const inviteUrl = (await codeEl.textContent()) || "";
    const match = inviteUrl.trim().match(/\/invite\/([a-f0-9]+)$/i);
    expect(match).toBeTruthy();
    inviteCode = match![1];
  });

  test("member signs up with invite", async ({ page }) => {
    expect(inviteCode).toBeTruthy();
    await page.goto(`/invite/${inviteCode}`);

    await expect(page.locator('.auth-tab[data-tab="signup"].active')).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#invite-code")).toHaveValue(inviteCode);
    await page.fill("#signup-username", MEMBER_USER);
    await page.fill("#signup-display", MEMBER_DISPLAY);
    await page.fill("#signup-password", MEMBER_PASS);
    await page.click("#signup-submit");

    await expect(page.locator("#msg-input")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator(".channel-list li", { hasText: "general" })
    ).toBeVisible();
  });

  test("post message in #general, open thread, reply", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login as member
    await page.goto("/");
    await page.fill("#username", MEMBER_USER);
    await page.fill("#password", MEMBER_PASS);
    await page.click("#submit");
    await expect(page.locator("#channel-header-text")).toHaveText("# general", {
      timeout: 10_000,
    });

    // Post a message
    const msgText = `smoke-msg-${RUN_ID}`;
    await page.fill("#msg-input", msgText);
    await page.click("#msg-send");
    await expect(
      page.locator(".message .msg-body", { hasText: msgText })
    ).toBeVisible({ timeout: 10_000 });

    // Open thread on that message
    const msgRow = page.locator(".message", { hasText: msgText });
    await msgRow.locator(".reply-btn").click();
    await expect(page.locator("#thread-panel")).toBeVisible({ timeout: 5000 });

    // Reply in thread
    const replyText = `smoke-reply-${RUN_ID}`;
    await page.fill("#reply-input", replyText);
    await page.click("#reply-send");
    await expect(
      page.locator(".thread-replies .msg-body", { hasText: replyText })
    ).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });
});
