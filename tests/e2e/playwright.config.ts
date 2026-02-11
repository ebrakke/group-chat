import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Relay Chat e2e tests
 * Targets the dev environment running on ports 3002 (frontend) and 4002 (API)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests serially to avoid database conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Single worker to avoid race conditions
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
