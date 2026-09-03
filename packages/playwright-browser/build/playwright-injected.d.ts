declare module "virtual:ayme-playwright-injected" {
  export type CaptureAriaSnapshotResult = {
    distilledText: string;
    fullText: string;
    refsByElement: Map<Element, string>;
  };

  type InjectedScriptOptions = {
    browserName: string;
    customEngines: Array<{ name: string; source: string }>;
    frameSeq: number;
    isUnderTest: boolean;
    isUtilityWorld: boolean;
    sdkLanguage: string;
    shouldPrependErrorPrefix: boolean;
    stableRafCount: number;
    testIdAttributeName: string;
  };

  export type ParsedSelector = {
    parts: Array<{ name: string; body: unknown }>;
    capture?: number;
  };

  export type ElementStateResult =
    | { matches: true; received: string }
    | { matches: false; received: string }
    | { matches: false; received: "error:notconnected" };

  export class InjectedScript {
    constructor(browserWindow: Window, options: InjectedScriptOptions);
    ariaSnapshot(node: Element, options: { mode: "ai" | "default" }): string;
    captureAriaSnapshot(root: Element): CaptureAriaSnapshotResult;
    parseSelector(selector: string): ParsedSelector;
    querySelector(
      selector: ParsedSelector,
      root: Element,
      strict?: boolean
    ): Element | undefined;
    querySelectorAll(selector: ParsedSelector, root: Element): Element[];
    elementState(
      node: Element,
      state: "visible" | "hidden" | "enabled" | "disabled" | "editable"
    ): ElementStateResult;
  }
}
