import { createHash } from "node:crypto";

import { upstreamPlaywright } from "@ayme-dev/playwright-browser/upstream";
import { normalizedPlaywrightPublicSurface } from "./playwright-public-surface.ts";

const shouldCheck = process.argv.includes("--check");
const shouldPrint = process.argv.includes("--print");
if ([shouldCheck, shouldPrint].filter(Boolean).length !== 1)
  throw new Error("Use exactly one of --check or --print.");

const expectedFingerprint = upstreamPlaywright.publicSurfaceFingerprint;
const fingerprint = sha256(normalizedPlaywrightPublicSurface());

if (shouldPrint) {
  console.log(fingerprint);
} else if (fingerprint !== expectedFingerprint) {
  throw new Error(
    `Playwright Page/Locator public surface drifted: expected ${expectedFingerprint}, received ${fingerprint}. Review the changed declarations and compatibility catalog, then run pnpm fingerprint:surface.`
  );
} else {
  console.log(`verified Playwright Page/Locator surface ${fingerprint}`);
}

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
