import type { Page } from "@playwright/test";
import type { ModelContextTool } from "@mcp-b/webmcp-types";
import type { JsonValue } from "./contracts";
import {
  resolvePageStateRefs,
  type AriaRef,
  type RefResolution,
} from "./pageState";
import { requireAymeRuntimePage } from "./registry";

type RefInput = { ref: AriaRef };
type FillRefInput = RefInput & { value: string };

export const clickPageStateRefTool = {
  name: "click_page_state_ref",
  description:
    "Click a real element ref from get_page_state. The ref is resolved against a fresh capture before the action. Call get_page_state again afterward before choosing the next action.",
  inputSchema: {
    type: "object",
    properties: { ref: { type: "string" } },
    required: ["ref"],
    additionalProperties: false,
  } as const,
  execute: async (input: unknown): Promise<JsonValue> => {
    const ref = readRef(input);
    await createRefInteractions(requireAymeRuntimePage()).click(ref);
    return { ok: true };
  },
} satisfies ModelContextTool<RefInput, JsonValue>;

export const fillPageStateRefTool = {
  name: "fill_page_state_ref",
  description:
    "Fill a real editable element ref from get_page_state with text. The ref is resolved against a fresh capture before the action. Call get_page_state again afterward before choosing the next action.",
  inputSchema: {
    type: "object",
    properties: { ref: { type: "string" }, value: { type: "string" } },
    required: ["ref", "value"],
    additionalProperties: false,
  } as const,
  execute: async (input: unknown): Promise<JsonValue> => {
    const { ref, value } = readFillInput(input);
    await createRefInteractions(requireAymeRuntimePage()).fill(ref, value);
    return { ok: true };
  },
} satisfies ModelContextTool<FillRefInput, JsonValue>;

function readRef(input: unknown): AriaRef {
  if (
    typeof input === "object" &&
    input !== null &&
    "ref" in input &&
    typeof input.ref === "string"
  )
    return input.ref;
  throw new Error("A Structural Ref string is required.");
}

function readFillInput(input: unknown): FillRefInput {
  if (
    typeof input === "object" &&
    input !== null &&
    "ref" in input &&
    typeof input.ref === "string" &&
    "value" in input &&
    typeof input.value === "string"
  )
    return { ref: input.ref, value: input.value };
  throw new Error("A Structural Ref and string value are required.");
}

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

  const registerStructuralRef = (
    page as Page & {
      registerStructuralRef?: (ref: AriaRef, element: Element) => void;
    }
  ).registerStructuralRef;
  registerStructuralRef?.call(
    page,
    resolution.node.ref,
    resolution.node.element
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
