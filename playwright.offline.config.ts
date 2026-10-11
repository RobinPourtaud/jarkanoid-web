import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/offline",
  workers: 1,
  timeout: 120000,
  use: {
    actionTimeout: 15000,
    baseURL: "http://127.0.0.1:5177",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    command: "npm run preview -- --port 5177 --strictPort",
    url: "http://127.0.0.1:5177",
    reuseExistingServer: false,
  },
});
