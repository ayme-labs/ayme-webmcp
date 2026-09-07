import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Page } from "@playwright/test";
import type { PomManifest, ToolManifest } from "./contracts";

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const action = (
  methodName: string,
  description = `Run ${methodName}.`,
  returnPoms: readonly string[] = []
): ToolManifest => ({
  methodName,
  toolName: methodName,
  description,
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  parameters: [{ name: "value", optional: false, schema: { type: "string" } }],
  returnPoms,
});

function manifest(
  className: string,
  overrides: Partial<PomManifest> = {}
): PomManifest {
  return {
    className,
    members: [],
    components: [],
    tools: [],
    ...overrides,
  };
}

async function setup() {
  vi.resetModules();
  const registry = await import("./registry");
  const definitions = await import("./pomDefinitions");
  registry.configureAymeRuntime({} as Page);
  return { registry, definitions };
}

describe("POM definition catalog", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("MutationObserver", FakeMutationObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discovers child and return POMs that are not mounted, then drops them on disposal", async () => {
    const { definitions, registry } = await setup();
    class StartPage {}
    registry.registerCompiledPom(
      StartPage,
      manifest("StartPage", {
        description: "Start here.",
        members: [
          {
            memberName: "sidebar",
            kind: "component",
            access: "field",
            componentClassName: "Sidebar",
            collection: false,
          },
        ],
        tools: [action("open", "Open a dialog.", ["HiddenDialog"])],
        components: [
          {
            className: "Sidebar",
            description: "A visible child.",
            members: [],
            tools: [],
          },
          {
            className: "HiddenDialog",
            members: [],
            tools: [action("details", "Open details.", ["DetailsPom"])],
          },
          { className: "DetailsPom", members: [], tools: [] },
          { className: "UnusedPom", members: [], tools: [] },
        ],
      })
    );
    const registration = registry.createPageRegistration(StartPage);

    expect(definitions.getPomDefinitions()).toEqual({
      definitions: [
        {
          name: "StartPage",
          description: "Start here.",
          children: ["Sidebar"],
          actions: [
            {
              name: "open",
              description: "Open a dialog.",
              inputSchema: {
                type: "object",
                properties: { value: { type: "string" } },
                required: ["value"],
                additionalProperties: false,
              },
              returnPoms: ["HiddenDialog"],
            },
          ],
        },
        {
          name: "Sidebar",
          description: "A visible child.",
          children: [],
          actions: [],
        },
        {
          name: "HiddenDialog",
          children: [],
          actions: [
            expect.objectContaining({
              name: "details",
              returnPoms: ["DetailsPom"],
            }),
          ],
        },
        { name: "DetailsPom", children: [], actions: [] },
      ],
    });

    registration.dispose();
    expect(definitions.getPomDefinitions()).toEqual({ definitions: [] });
  });

  it("returns explicit unknown and ambiguous lookup outcomes while deduplicating identical definitions", async () => {
    const { definitions, registry } = await setup();
    class FirstPage {}
    class SecondPage {}
    class ConflictingPage {}
    class OtherConflictingPage {}
    const shared = manifest("SharedPage", { description: "Shared." });
    registry.registerCompiledPom(FirstPage, shared);
    registry.registerCompiledPom(SecondPage, shared);
    registry.registerCompiledPom(
      ConflictingPage,
      manifest("ConflictingPage", { description: "First definition." })
    );
    registry.registerCompiledPom(
      OtherConflictingPage,
      manifest("ConflictingPage", { description: "Second definition." })
    );
    const registrations = [
      registry.createPageRegistration(FirstPage),
      registry.createPageRegistration(SecondPage),
      registry.createPageRegistration(ConflictingPage),
      registry.createPageRegistration(OtherConflictingPage),
    ];

    expect(definitions.getPomDefinitions()).toEqual({
      definitions: [
        {
          name: "SharedPage",
          description: "Shared.",
          children: [],
          actions: [],
        },
      ],
    });
    expect(definitions.getPomDefinition("MissingPom")).toEqual({
      status: "unknown",
      name: "MissingPom",
    });
    expect(definitions.getPomDefinition("ConflictingPage")).toEqual({
      status: "ambiguous",
      name: "ConflictingPage",
    });

    registrations.forEach((registration) => registration.dispose());
  });

  it("keeps definition action descriptions and schemas equal to callable tools", async () => {
    const { definitions, registry } = await setup();
    class ToolPage {
      run(value: string) {
        return value;
      }
    }
    const tool = action("run", "Run the operation.");
    registry.registerCompiledPom(
      ToolPage,
      manifest("ToolPage", { tools: [tool] })
    );
    const registration = registry.createPageRegistration(ToolPage);

    const definition = definitions.getPomDefinition("ToolPage");
    const callable = registry.listRegisteredPomTools()[0];
    expect(definition).toEqual({
      status: "found",
      definition: {
        name: "ToolPage",
        children: [],
        actions: [
          {
            name: "run",
            description: callable?.description,
            inputSchema: callable?.inputSchema,
            returnPoms: [],
          },
        ],
      },
    });

    registration.dispose();
  });

  it("serializes a live returned POM as an acknowledgement", async () => {
    const { registry } = await setup();
    class ReturnedPom {}
    class ReturningPage {
      open() {
        return new ReturnedPom();
      }

      status() {
        return { state: "ready" };
      }
    }
    registry.registerCompiledPom(
      ReturningPage,
      manifest("ReturningPage", {
        tools: [
          action("open", undefined, ["ReturnedPom"]),
          action("status", undefined, ["ReturnedPom"]),
        ],
      })
    );
    const registration = registry.createPageRegistration(ReturningPage);
    const [open, status] = registry.listRegisteredPomTools();

    await expect(open?.execute({ value: "go" })).resolves.toEqual({
      ok: true,
    });
    await expect(status?.execute({ value: "go" })).resolves.toEqual({
      ok: true,
      result: { state: "ready" },
    });

    registration.dispose();
  });
});
