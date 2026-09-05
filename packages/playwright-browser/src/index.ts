import type { Page } from "@playwright/test";

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

export function captureAriaSnapshot(root: Element) {
  return injectedScriptFor(root).captureAriaSnapshot(root);
}

// ── Page factory ────────────────────────────────────────────────────

type CreatePageOptions = {
  onTrace?: (entry: import("./types").TraceEntry) => void;
  pacing?: import("./types").BrowserInteractionPacing;
};

export function createPage(options: CreatePageOptions = {}): Page {
  return PageImpl.fromWindow(
    window,
    options.onTrace,
    options.pacing
  ) as unknown as Page;
}
