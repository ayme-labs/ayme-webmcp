import { defineConfig } from "tsdown";

import { upstreamPlaywright } from "@ayme-dev/playwright-browser/upstream";

const playwrightSource = `../playwright-browser/source/playwright-${upstreamPlaywright.version}`;

export default defineConfig({
  clean: true,
  copy: [
    {
      from: `${playwrightSource}/LICENSE`,
      rename: "PLAYWRIGHT_LICENSE",
      to: "dist",
    },
    {
      from: `${playwrightSource}/NOTICE`,
      rename: "PLAYWRIGHT_NOTICE",
      to: "dist",
    },
    {
      from: `${playwrightSource}/ThirdPartyNotices.txt`,
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
