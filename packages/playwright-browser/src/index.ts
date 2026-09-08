import type { Page } from "@playwright/test";
import type { CaptureAriaSnapshotResult } from "./types";

import { injectedScriptFor } from "./injected";
import { PageImpl } from "./page";

export { AdapterJSHandle } from "./page";

export type {
  BrowserInteractionPacing,
  CaptureAriaSnapshotResult,
  TraceEntry,
} from "./types";

export {
  isAymeLocator,
  LOCATOR_BRAND,
  resolveLocatorElements,
} from "./locator";

// ── ARIA capture ────────────────────────────────────────────────────

export function ariaSnapshot(root: Element) {
  return injectedScriptFor(root).ariaSnapshot(root, { mode: "ai" });
}

export function captureAriaSnapshot(root: Element): CaptureAriaSnapshotResult {
  return injectedScriptFor(root).captureAriaSnapshot(root);
}

// ── Page factory ────────────────────────────────────────────────────

type CreatePageOptions = {
  onTrace?: (entry: import("./types").TraceEntry) => void;
  pacing?: import("./types").BrowserInteractionPacing;
};

declare const __AYME_PLAYWRIGHT_ACTION_TIMEOUT__: number | undefined;
declare const __AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__: number | undefined;

export function createPage(options: CreatePageOptions = {}): Page {
  const page = PageImpl.fromWindow(window, options.onTrace, options.pacing);
  if (typeof __AYME_PLAYWRIGHT_ACTION_TIMEOUT__ === "number")
    page.setDefaultTimeout(__AYME_PLAYWRIGHT_ACTION_TIMEOUT__);
  if (typeof __AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__ === "number")
    page.setDefaultNavigationTimeout(__AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__);
  return page as unknown as Page;
}
