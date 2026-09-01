import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
  },
});
