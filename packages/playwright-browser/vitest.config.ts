import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["src/index.test.ts"],
    include: ["src/**/*.test.ts"],
  },
});
