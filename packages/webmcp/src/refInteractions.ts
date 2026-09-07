import type { Page } from "@playwright/test";
import {
  resolvePageStateRefs,
  type AriaRef,
  type RefResolution,
} from "./pageState";

export type RefInteractions = Readonly<{
  click(ref: AriaRef): Promise<void>;
  fill(ref: AriaRef, value: string): Promise<void>;
}>;

/**
 * Build action methods for Structural Refs using the configured browser page.
 * The caller owns the page's configuration, including pacing and tracing.
 */
export function createRefInteractions(
  page: Page,
  currentDocument: Document = requireCurrentDocument()
): RefInteractions {
  return {
    click: (ref) => performAction(page, currentDocument, "click", ref),
    fill: (ref, value) =>
      performAction(page, currentDocument, "fill", ref, value),
  };
}

async function performAction(
  page: Page,
  currentDocument: Document,
  action: "click" | "fill",
  requestedRef: AriaRef,
  value?: string
): Promise<void> {
  const resolution = (
    await resolvePageStateRefs(currentDocument, requestedRef)
  )[0]!;

  if (resolution.status === "unresolved")
    throw unresolvedRefError(action, resolution);

  if (resolution.node.ref.startsWith("s_"))
    throw new Error(
      `Cannot ${action} ref "${requestedRef}": synthetic observation-only ref.`
    );

  const locator = page.locator(`aria-ref=${resolution.node.ref}`);
  if (action === "click") await locator.click();
  else await locator.fill(value!);
}

function unresolvedRefError(
  action: "click" | "fill",
  resolution: Extract<RefResolution, { status: "unresolved" }>
): Error {
  return new Error(
    `Cannot ${action} ref "${resolution.requestedRef}": ${resolution.reason}.`
  );
}

function requireCurrentDocument(): Document {
  if (typeof document === "undefined")
    throw new Error("Structural Ref interactions require a browser Document.");
  return document;
}
