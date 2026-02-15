import { defineConfig } from "@playwright/test";

const PORT = process.env.TEST_PORT || "8090";
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: BASE_URL || `http://localhost:${PORT}`,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
