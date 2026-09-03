import { playwright } from "@vitest/browser-playwright";
import { playwrightInjectedPlugin } from "@ayme-dev/playwright-browser/tsdown";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [playwrightInjectedPlugin()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
    include: ["src/**/*.browser.test.ts"],
  },
});
