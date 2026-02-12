import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Relay Chat e2e tests
 * Targets the dev environment running on ports 3002 (frontend) and 4002 (API)
 * 
 * Supports viewport configuration via environment variables:
 * - VIEWPORT_WIDTH, VIEWPORT_HEIGHT: Custom viewport size
 * - VIEWPORT_NAME: desktop or mobile (for CI matrix testing)
 */

// Determine viewport configuration from environment variables
const viewportWidth = process.env.VIEWPORT_WIDTH ? parseInt(process.env.VIEWPORT_WIDTH) : 1280;
const viewportHeight = process.env.VIEWPORT_HEIGHT ? parseInt(process.env.VIEWPORT_HEIGHT) : 720;
const viewportName = process.env.VIEWPORT_NAME || 'desktop';

// Configure device emulation for mobile viewport
const isMobile = viewportName === 'mobile';
const deviceConfig = isMobile ? {
  ...devices['iPhone 12'],
  viewport: { width: viewportWidth, height: viewportHeight },
} : {
  ...devices['Desktop Chrome'],
  viewport: { width: viewportWidth, height: viewportHeight },
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests serially to avoid database conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Single worker to avoid race conditions
  globalSetup: './tests/global-setup.ts', // Reset database before tests
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },

  projects: [
    {
      name: `chromium-${viewportName}`,
      use: deviceConfig,
    },
  ],

  // Global timeout settings
  timeout: 30000, // 30s for each test
  expect: {
    timeout: 10000, // 10s for assertions
  },

  // Web server configuration (optional - assumes dev stack is already running)
  // Uncomment if you want Playwright to auto-start the dev stack
  // webServer: {
  //   command: 'cd ../.. && docker compose -f docker-compose.dev.yml up -d',
  //   url: 'http://localhost:3002',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});
