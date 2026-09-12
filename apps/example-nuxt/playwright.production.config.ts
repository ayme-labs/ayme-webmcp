import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  outputDir: "test-results/production",
  webServer: {
    command: "pnpm run start",
    env: { HOST: "127.0.0.1", PORT: "4193" },
    url: "http://127.0.0.1:4193",
    stdout: "pipe",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
