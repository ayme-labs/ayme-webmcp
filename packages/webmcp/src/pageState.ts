import { InjectedScript } from "@ayme-dev/playwright-browser/injected";

import type { ModelContextTool } from "@mcp-b/webmcp-types";

let injectedScript: InjectedScript | undefined;

const inputSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const getPageStateTool = {
  name: "get_page_state",
  description:
    "Return the current page as Playwright's AI ARIA snapshot with structural refs.",
  inputSchema,
  execute: async () => capturePageState(),
} satisfies ModelContextTool<Record<string, never>, string>;

function capturePageState() {
  injectedScript ??= new InjectedScript(window, {
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
  return injectedScript.ariaSnapshot(document.body, { mode: "ai" });
}
