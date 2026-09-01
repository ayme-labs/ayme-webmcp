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

  export class InjectedScript {
    constructor(browserWindow: Window, options: InjectedScriptOptions);
    ariaSnapshot(node: Element, options: { mode: "ai" | "default" }): string;
    captureAriaSnapshot(root: Element): CaptureAriaSnapshotResult;
  }
}
