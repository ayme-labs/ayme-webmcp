export type InjectedScriptOptions = {
  browserName: string;
  customEngines: { name: string; source: string }[];
  frameSeq: number;
  isUnderTest: boolean;
  isUtilityWorld?: boolean;
  sdkLanguage: string;
  shouldPrependErrorPrefix?: boolean;
  stableRafCount: number;
  testIdAttributeName: string;
};

export declare class InjectedScript {
  constructor(window: Window & typeof globalThis, options: InjectedScriptOptions);
  ariaSnapshot(element: Element, options: { mode: "ai" | "default" | "codegen" }): string;
  elementState(element: Element, state: string): { matches: boolean };
  generateSelector(target: Element, options: { testIdAttributeName: string }): { selector: string };
  parseSelector(selector: string): unknown;
  querySelectorAll(selector: unknown, root: Document | Element): Element[];
}

declare global {
  var AymePlaywrightRuntime: { InjectedScript: typeof InjectedScript };
}
