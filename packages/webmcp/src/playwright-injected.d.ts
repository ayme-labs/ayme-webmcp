declare module "virtual:ayme-playwright-injected" {
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
    ariaSnapshot(node: Node, options: { mode: "ai" | "default" }): string;
  }
}
