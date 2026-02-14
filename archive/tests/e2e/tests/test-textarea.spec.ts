import { test, expect } from '@playwright/test';

test('textarea should be clickable and typeable', async ({ page }) => {
  // Go to prod
  await page.goto('https://chat.brakke.cc/');
  
  // Wait for login page or main page
  await page.waitForLoadState('networkidle');
  
  // Check if we need to login
  const isLoginPage = await page.locator('input[type="text"]').first().isVisible().catch(() => false);
  
  if (isLoginPage) {
    console.log('Login page detected - need to login first');
    // If we're on login, we need credentials
    // For now, just check if the page loaded
    await expect(page.locator('h1')).toContainText('Relay Chat');
  } else {
    // We're logged in, test the textarea
    const textarea = page.locator('textarea[placeholder*="Message"]');
    
    // Wait for textarea to be visible
    await expect(textarea).toBeVisible({ timeout: 10000 });
    
    // Try to click it
    await textarea.click();
    
    // Try to type
    await textarea.fill('Hello from Playwright test!');
    
    // Verify the text was entered
    await expect(textarea).toHaveValue('Hello from Playwright test!');
    
    console.log('✅ Textarea is working correctly!');
  }
});

test('check what element receives click on textarea area', async ({ page }) => {
  await page.goto('https://chat.brakke.cc/');
  await page.waitForLoadState('networkidle');
  
  // Wait for the form to be visible
  const form = page.locator('form').filter({ has: page.locator('textarea') });
  await expect(form).toBeVisible({ timeout: 10000 });
  
  // Get the textarea bounding box
  const textarea = page.locator('textarea[placeholder*="Message"]');
  const box = await textarea.boundingBox();
  
  if (!box) {
    console.log('❌ Textarea not found or not visible');
    return;
  }
  
  console.log('Textarea bounding box:', box);
  
  // Click at the center of where the textarea should be
  const clickX = box.x + box.width / 2;
  const clickY = box.y + box.height / 2;
  
  // Get the element at that point BEFORE clicking
  const elementHandle = await page.evaluateHandle(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return {
      tagName: el?.tagName,
      className: el?.className,
      id: el?.id,
      computedStyle: el ? {
        pointerEvents: window.getComputedStyle(el).pointerEvents,
        zIndex: window.getComputedStyle(el).zIndex,
        position: window.getComputedStyle(el).position,
      } : null,
    };
  }, { x: clickX, y: clickY });
  
  const elementInfo = await elementHandle.jsonValue();
  console.log('Element at textarea position:', elementInfo);
  
  // Now try to click and type
  await page.mouse.click(clickX, clickY);
  
  // Try to type
  await page.keyboard.type('test');
  
  // Check if it worked
  const value = await textarea.inputValue();
  console.log('Textarea value after typing:', value);
  
  if (value === 'test') {
    console.log('✅ Typing worked!');
  } else {
    console.log('❌ Typing failed - value is:', value);
  }
});
