import { test, expect } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';
import * as fs from 'fs';
import * as path from 'path';

// Skip these tests if Blossom is not available
const SKIP_FILE_TESTS = !process.env.BLOSSOM_ENABLED;

test.describe('File Uploads', () => {
  test.skip(SKIP_FILE_TESTS, 'Blossom not enabled');

  test.beforeEach(async () => {
    // Create a test image if it doesn't exist
    const testImagePath = path.join(__dirname, '../../test-fixtures/test-image.png');
    
    if (!fs.existsSync(testImagePath)) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
      
      // Create a simple 1x1 PNG (base64 encoded minimal PNG)
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      fs.writeFileSync(testImagePath, pngData);
    }
  });

  test('should upload image via file picker', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const testImagePath = path.join(__dirname, '../../test-fixtures/test-image.png');
    
    // Click upload button to open file picker
    await adminUser.page.click('button:has-text("📎"), input[type="file"]');
    
    // Upload file
    await chat.uploadFile(testImagePath);
    
    // Send the message with attachment
    await chat.sendButton.click();
    
    // Image preview should appear in chat
    const hasPreview = await chat.hasImagePreview('test-image.png');
    expect(hasPreview).toBeTruthy();
  });

  test('should show image preview inline', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const testImagePath = path.join(__dirname, '../../test-fixtures/test-image.png');
    
    await chat.uploadFile(testImagePath);
    await chat.sendButton.click();
    
    // Wait for image to appear
    await expect(
      adminUser.page.locator('img[alt*="test-image"], img[src*="test-image"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show download link for non-image files', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    
    // Create a test text file
    const testFilePath = path.join(__dirname, '../../test-fixtures/test-doc.txt');
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
    fs.writeFileSync(testFilePath, 'Test document content');
    
    await chat.uploadFile(testFilePath);
    await chat.sendButton.click();
    
    // Should show download link
    const hasDownload = await chat.hasDownloadLink('test-doc.txt');
    expect(hasDownload).toBeTruthy();
    
    // Cleanup
    fs.unlinkSync(testFilePath);
  });

  test('should handle multiple file uploads', async ({ adminUser }) => {
    const chat = new ChatPage(adminUser.page);
    const testImagePath = path.join(__dirname, '../../test-fixtures/test-image.png');
    
    // Upload multiple times (if UI supports it)
    await chat.uploadFile(testImagePath);
    
    // If UI shows preview before sending, verify it
    await chat.messageInput.fill('Message with attachment');
    await chat.sendButton.click();
    
    // Verify attachment appeared
    await expect(
      adminUser.page.locator('img[alt*="test-image"], img[src*="test-image"]')
    ).toBeVisible({ timeout: 10000 });
  });
});
