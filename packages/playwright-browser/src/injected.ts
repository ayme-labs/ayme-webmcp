// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../build/playwright-injected.d.ts" />

import { InjectedScript } from "virtual:ayme-playwright-injected";

const injectedScripts = new WeakMap<Window, InjectedScript>();

export function injectedScriptFor(root: Element) {
  const browserWindow = root.ownerDocument.defaultView;
  if (!browserWindow)
    throw new Error("Cannot capture ARIA state without a browser Window.");

  let injectedScript = injectedScripts.get(browserWindow);
  if (!injectedScript) {
    injectedScript = new InjectedScript(browserWindow, {
      browserName: "chromium",
      customEngines: [],
      frameSeq: 0,
      isUnderTest: false,
      isUtilityWorld: false,
      sdkLanguage: "javascript",
      shouldPrependErrorPrefix: false,
      stableRafCount: 0,
      testIdAttributeName: "data-testid",
    });
    injectedScripts.set(browserWindow, injectedScript);
  }
  return injectedScript;
}
