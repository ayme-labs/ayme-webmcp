import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4191" },
  webServer: {
    command: "pnpm run dev",
    url: "http://127.0.0.1:4191",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
