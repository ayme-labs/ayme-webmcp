import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [
      /^@ayme-dev\/playwright-browser\/(?:catalog|currentSupport)$/,
    ],
  },
  dts: true,
  entry: ["src/index.ts", "src/vite.ts"],
  format: ["esm"],
});
