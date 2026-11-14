import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  retries: 0,
  use: { httpCredentials: { username: process.env.APP_USERNAME ?? "test", password: process.env.APP_PASSWORD ?? "test-password-long-enough" }, baseURL: process.env.E2E_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000/api/health",
        env: { AUTH_SECRET: process.env.AUTH_SECRET ?? "browser-test-session-secret-at-least-32-characters", APP_USERNAME: process.env.APP_USERNAME ?? "test", APP_PASSWORD: process.env.APP_PASSWORD ?? "test-password-long-enough" },
        reuseExistingServer: true,
        timeout: 60000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } }],
});
