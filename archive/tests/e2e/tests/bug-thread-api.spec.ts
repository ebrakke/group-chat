import { test, expect } from '../fixtures/auth';
import { ChatPage } from '../fixtures/chat';

/**
 * Bug Fix Tests: Thread API Endpoint
 * 
 * Tests derived from: bug-thread-api.feature
 * 
 * Ensures that:
 * - Thread panel loads without JSON parse errors
 * - Thread API returns valid JSON (not HTML)
 * - Thread replies display correctly in chronological order
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3002';

test.describe('Thread API Endpoint', () => {
  test('should load thread panel without errors', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Monitor console for errors
    const consoleErrors: string[] = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Create a message with a thread
    const parentMessage = `Discussion topic ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Click reply button to open thread panel
    await chat.openThread(parentMessage);
    
    // Thread panel should open successfully
    await expect(authenticatedPage.locator('aside').last()).toBeVisible();
    
    // Original message should be visible in thread panel
    await expect(
      authenticatedPage.locator('aside', { hasText: parentMessage })
    ).toBeVisible();
    
    // Check for JSON parse errors in console
    const jsonParseErrors = consoleErrors.filter(err => 
      err.toLowerCase().includes('json') || 
      err.toLowerCase().includes('parse') ||
      err.toLowerCase().includes('unexpected token')
    );
    
    expect(jsonParseErrors).toHaveLength(0);
  });

  test('should return valid JSON from thread API endpoint', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create a message to get its ID
    const parentMessage = `API test message ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Get the message ID from the DOM (assuming it's stored as data attribute or in API response)
    // We'll need to extract it by opening the thread and inspecting network requests
    const responsePromise = authenticatedPage.waitForResponse(
      response => response.url().includes('/api/v1/messages/') && response.url().includes('/thread')
    );
    
    await chat.openThread(parentMessage);
    
    const response = await responsePromise;
    
    // Response status should be 200
    expect(response.status()).toBe(200);
    
    // Content-Type should be application/json
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
    
    // Response should be valid JSON
    const body = await response.json();
    expect(body).toBeDefined();
    
    // Response should contain 'root' object
    expect(body).toHaveProperty('root');
    expect(body.root).toBeDefined();
    
    // Response should contain 'replies' array
    expect(body).toHaveProperty('replies');
    expect(Array.isArray(body.replies)).toBe(true);
  });

  test('should load thread with multiple replies in chronological order', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create parent message
    const parentMessage = `Parent message ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread and add 3 replies
    await chat.openThread(parentMessage);
    
    const replies = [
      `Reply 1 ${Date.now()}`,
      `Reply 2 ${Date.now() + 100}`,
      `Reply 3 ${Date.now() + 200}`,
    ];
    
    for (const reply of replies) {
      await chat.sendThreadReply(reply);
      await authenticatedPage.waitForTimeout(500); // Wait between replies
    }
    
    // Close and reopen thread to test fresh load from API
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);
    
    await chat.openThread(parentMessage);
    
    // All 3 replies should be visible
    for (const reply of replies) {
      await expect(
        authenticatedPage.locator('aside .prose', { hasText: reply })
      ).toBeVisible();
    }
    
    // Replies should be in chronological order (earliest first)
    const replyElements = await authenticatedPage.locator('aside .prose').allTextContents();
    
    // Find the indices of our replies in the thread panel
    const indices = replies.map(reply => {
      return replyElements.findIndex(text => text.includes(reply));
    });
    
    // Indices should be in ascending order (chronological)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  test('should handle empty thread (no replies yet)', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create parent message without any replies
    const parentMessage = `Empty thread ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread panel
    await chat.openThread(parentMessage);
    
    // Thread panel should show parent message
    await expect(
      authenticatedPage.locator('aside', { hasText: parentMessage })
    ).toBeVisible();
    
    // Should not show any error state
    await expect(
      authenticatedPage.locator('aside:has-text("Error")')
    ).toHaveCount(0);
  });

  test('should not receive HTML instead of JSON', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    // Create a message
    const parentMessage = `JSON not HTML test ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Set up response interceptor to check content
    const responsePromise = authenticatedPage.waitForResponse(
      response => response.url().includes('/api/v1/messages/') && response.url().includes('/thread')
    );
    
    await chat.openThread(parentMessage);
    
    const response = await responsePromise;
    
    // Get raw response body text
    const bodyText = await response.text();
    
    // Should not contain HTML tags
    expect(bodyText).not.toContain('<!DOCTYPE');
    expect(bodyText).not.toContain('<html');
    expect(bodyText).not.toContain('<body');
    
    // Should be valid JSON (parse without throwing)
    expect(() => JSON.parse(bodyText)).not.toThrow();
  });

  test('should show thread count after adding replies', async ({ authenticatedPage }) => {
    const chat = new ChatPage(authenticatedPage);
    
    const parentMessage = `Thread count test ${Date.now()}`;
    await chat.sendMessage(parentMessage);
    
    // Open thread and add replies
    await chat.openThread(parentMessage);
    
    await chat.sendThreadReply(`Reply A ${Date.now()}`);
    await chat.sendThreadReply(`Reply B ${Date.now()}`);
    
    // Close thread
    await authenticatedPage.locator('aside button:has-text("Close")').click();
    await authenticatedPage.waitForTimeout(500);
    
    // Thread count should be 2
    const threadCount = await chat.getThreadCount(parentMessage);
    expect(threadCount).toBe(2);
    
    // Reopen thread to verify API loads correctly
    await chat.openThread(parentMessage);
    
    // Both replies should be visible
    await expect(
      authenticatedPage.locator('aside .prose:has-text("Reply A")')
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('aside .prose:has-text("Reply B")')
    ).toBeVisible();
  });
});
