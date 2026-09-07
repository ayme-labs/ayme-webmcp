import type { ModelContextTool } from "@mcp-b/webmcp-types";
import type { JsonValue, PomDefinition } from "./contracts";
import {
  getPageStateForDocument,
  type AriaRef,
  type PageState,
} from "./pageState";
import { getPomDefinitions } from "./pomDefinitions";

type GetPageContextInput = { name?: string };

export type PageContext = {
  readonly structure: string;
  readonly pomDefinitions: readonly PomDefinition[];
  resolve(...refs: AriaRef[]): ReturnType<PageState["resolve"]>;
};

export type PageContextPayload = Pick<
  PageContext,
  "structure" | "pomDefinitions"
>;

export const getPageContextTool = {
  name: "get_page_context",
  description:
    "Return the current structural page state together with registered POM definitions, including referenced POMs that are not currently visible.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: [],
    additionalProperties: false,
  } as const,
  execute: async (input: unknown): Promise<JsonValue> => {
    const context = await getPageContextForDocument(
      document,
      definitionNameFrom(input)
    );
    return JSON.parse(
      JSON.stringify({
        structure: context.structure,
        pomDefinitions: context.pomDefinitions,
      })
    ) as JsonValue;
  },
} satisfies ModelContextTool<GetPageContextInput, JsonValue>;

export async function getPageContextForDocument(
  currentDocument: Document,
  name?: string
): Promise<PageContext> {
  const pageState = await getPageStateForDocument(currentDocument);
  return Object.freeze({
    structure: pageState.text,
    pomDefinitions: getPomDefinitions(name).definitions,
    resolve: pageState.resolve,
  });
}

function definitionNameFrom(input: unknown): string | undefined {
  if (input === undefined || input === null || typeof input !== "object")
    return undefined;
  if (!("name" in input) || input.name === undefined) return undefined;
  if (typeof input.name === "string") return input.name;
  throw new Error("POM definition name must be a string.");
}
