import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Relay Chat e2e tests
 * Targets the dev environment running on ports 3002 (frontend) and 4002 (API)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Configure global timeout
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  // Web server configuration (optional - assumes dev stack is already running)
  // Uncomment if you want Playwright to auto-start the dev stack
  // webServer: {
  //   command: 'cd ../.. && make dev',
  //   url: 'http://localhost:3002',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});
