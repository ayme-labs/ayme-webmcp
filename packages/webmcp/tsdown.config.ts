import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  copy: [
    {
      from: "../playwright-browser/source/playwright-1.62.1/LICENSE",
      rename: "PLAYWRIGHT_LICENSE",
      to: "dist",
    },
    {
      from: "../playwright-browser/source/playwright-1.62.1/NOTICE",
      rename: "PLAYWRIGHT_NOTICE",
      to: "dist",
    },
    {
      from: "../playwright-browser/source/playwright-1.62.1/ThirdPartyNotices.txt",
      rename: "PLAYWRIGHT_THIRD_PARTY_NOTICES.txt",
      to: "dist",
    },
  ],
  deps: {
    alwaysBundle: [/^@ayme-dev\/playwright-browser(?:\/.*)?$/],
    dts: {
      alwaysBundle: [/^@ayme-dev\/playwright-browser(?:\/.*)?$/],
    },
  },
  dts: { eager: true },
  entry: ["src/index.ts", "src/internal.ts"],
  format: ["esm"],
});
