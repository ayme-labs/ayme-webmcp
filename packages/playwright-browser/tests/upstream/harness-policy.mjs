/**
 * Single source of truth for the test-harness policy.
 *
 * Imported by:
 *   - adapter-bridge.ts  (Playwright TypeScript)
 *   - upstream-baseline.mjs  (Node script)
 *
 * This is harness policy, not an API compatibility ledger.
 */

// Page operations explicitly routed through the real Playwright driver
// because they are genuine arrange/observe infrastructure.
// NO Page/Locator API that a selected upstream spec is testing may
// appear here.
export const DRIVER_ALLOWLIST = new Set([
  "evaluate",
  "evaluateHandle",
  "addInitScript",
  "exposeFunction",
  "goto",
  "setContent",
  "route",
  "unroute",
  "setViewportSize",
  "waitForTimeout",
]);

/**
 * Returns a concise reason string when a spec's results cannot be
 * trusted as adapter compatibility evidence, or null when results are
 * valid.
 *
 * @param {string} specBasename
 * @returns {string | null}
 */
export function harnessUnsupportedReason(specBasename) {
  if (specBasename === "page-basic.spec.ts")
    return "mixed-subject suite tests multiple driver-backed Page APIs";

  if (
    specBasename === "page-aria-snapshot.spec.ts" ||
    specBasename === "page-aria-snapshot-ai.spec.ts"
  )
    return "InjectedScript is stubbed; results are not meaningful until the real module is loaded";

  if (specBasename === "page-wait-for-function.spec.ts")
    return "proxy cannot serialize function arguments; passes are incidental error-message matches";

  if (!specBasename.startsWith("page-")) return null;
  const match = specBasename.match(/^page-(.+)\.spec\.ts$/);
  if (!match) return null;
  const method = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (DRIVER_ALLOWLIST.has(method))
    return `"${method}" runs through the driver allowlist`;

  return null;
}
