import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      "@ayme-dev/playwright-browser",
      "@ayme-dev/structural-observation",
    ],
  },
  dts: true,
  entry: ["src/index.ts", "src/internal.ts"],
  format: ["esm"],
});
