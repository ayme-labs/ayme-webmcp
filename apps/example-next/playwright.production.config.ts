import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testIgnore: "**/incremental.spec.ts",
  outputDir: "test-results/production",
  webServer: {
    command: "pnpm run start",
    url: "http://127.0.0.1:4192",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
