import type { PomDefinitionsResult } from "./contracts";
import { getPomDefinitions } from "./pomDefinitions";
import {
  getPageStateForDocument,
  type AriaRef,
  type PageState,
} from "./pageState";
import { createRefInteractions } from "./refInteractions";
import { requireAymeRuntimePage } from "./registry";

export type Ayme = {
  getPageState(): Promise<PageState>;
  getPomDefinitions(name?: string): PomDefinitionsResult;
  click(ref: AriaRef): Promise<void>;
  fill(ref: AriaRef, value: string): Promise<void>;
};

export const ayme: Ayme = {
  getPageState: async () => getPageStateForDocument(requireCurrentDocument()),
  getPomDefinitions,
  click: async (ref) =>
    createRefInteractions(
      requireAymeRuntimePage(),
      requireCurrentDocument()
    ).click(ref),
  fill: async (ref, value) =>
    createRefInteractions(
      requireAymeRuntimePage(),
      requireCurrentDocument()
    ).fill(ref, value),
};

export default ayme;

function requireCurrentDocument(): Document {
  if (typeof document === "undefined")
    throw new Error("Ayme requires a browser Document.");
  return document;
}
