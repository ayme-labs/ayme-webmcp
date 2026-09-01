import { ariaSnapshot } from "@ayme-dev/playwright-browser/capture";
import type { ModelContextTool } from "@mcp-b/webmcp-types";

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
  return ariaSnapshot(document.body);
}
