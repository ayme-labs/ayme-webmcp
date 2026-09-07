import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Each file creates TypeScript programs; parallel files contend on CI runners.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
