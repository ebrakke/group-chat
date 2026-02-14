import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import * as path from 'path';
import * as fs from 'fs';

test.describe('File Uploads', () => {
  // Create test files
  test.beforeAll(async () => {
    const testDir = path.join(__dirname, '../test-files');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create a test image
    const testImage = path.join(testDir, 'test-image.png');
    if (!fs.existsSync(testImage)) {
      // Create a simple 1x1 PNG
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testImage, pngBuffer);
    }
    
    // Create a test PDF (minimal valid PDF)
    const testPdf = path.join(testDir, 'test-file.pdf');
    if (!fs.existsSync(testPdf)) {
      const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
203
%%EOF`;
      fs.writeFileSync(testPdf, pdfContent);
    }
  });

  test.skip('User uploads a file via the attach button', async ({ memberUser }) => {
    // Skipped: Blossom file upload is known to be broken
    const { page } = memberUser;
    const chatPage = new ChatPage(page);
    
    // Click attach button
    const attachBtn = page.locator('button[title*="Attach"], button:has-text("📎"), input[type="file"]').first();
    
    const testFile = path.join(__dirname, '../test-files/test-image.png');
    
    // Set file
    const fileInput = await attachBtn.elementHandle();
    if (fileInput) {
      await fileInput.setInputFiles(testFile);
    } else {
      const input = page.locator('input[type="file"]');
      await input.setInputFiles(testFile);
    }
    
    // Should see preview
    await expect(page.locator('img[src*="test-image"], .preview').first()).toBeVisible({ timeout: 5000 });
    
    // Send
    await chatPage.sendButton.click();
    
    // Message should appear with attachment
    await expect(page.locator('.message:has-text("test-image.png"), img[alt*="test-image"]').first()).toBeVisible();
  });

  test.skip('User uploads by drag and drop', async ({ memberUser }) => {
    // Skipped: Blossom not working
    const { page } = memberUser;
    
    const testFile = path.join(__dirname, '../test-files/test-file.pdf');
    
    // Create data transfer
    const dataTransfer = await page.evaluateHandle(async (filePath) => {
      const dt = new DataTransfer();
      const response = await fetch(filePath);
      const blob = await response.blob();
      const file = new File([blob], 'test-file.pdf', { type: 'application/pdf' });
      dt.items.add(file);
      return dt;
    }, testFile);
    
    // Dispatch drop event
    const messageInput = page.locator('textarea[placeholder*="Message"]').first();
    await messageInput.dispatchEvent('drop', { dataTransfer });
    
    // Should see preview
    await expect(page.locator('text=test-file.pdf').first()).toBeVisible({ timeout: 5000 });
  });

  test.skip('User uploads by pasting an image', async ({ memberUser }) => {
    // Skipped: Blossom not working
  });

  test.skip('Image attachments show inline preview', async ({ memberUser }) => {
    // Skipped: Blossom not working
  });

  test.skip('Non-image files show download link', async ({ memberUser }) => {
    // Skipped: Blossom not working
  });

  test.skip('Upload fails for files exceeding size limit', async ({ memberUser }) => {
    // Skipped: Blossom not working
  });

  test.skip('User sends a message with text and attachment', async ({ memberUser }) => {
    // Skipped: Blossom not working
  });
});
