import path from "node:path";

import {
  compatibilityCatalog,
  type CompatibilityMember,
} from "@ayme-dev/playwright-browser/catalog";
import { currentSupport } from "@ayme-dev/playwright-browser/currentSupport";
import { describe, expect, it } from "vitest";

import { derivePomManifests } from "./index";

function manifestFor(fixture: string) {
  return derivePomManifests(path.resolve(`src/fixtures/${fixture}.ts`))[0];
}

describe("derivePomManifests", () => {
  it("includes inherited public locator members", () => {
    const manifest = manifestFor("inheritedPom");

    expect(manifest?.members).toEqual([
      {
        memberName: "ownButton",
        kind: "locator",
        access: "field",
      },
      {
        memberName: "inheritedButton",
        kind: "locator",
        access: "field",
      },
    ]);
  });

  it("includes inherited decorated tools", () => {
    const manifest = manifestFor("inheritedPom");

    expect(manifest?.tools).toEqual([
      {
        methodName: "inheritedTool",
        toolName: "InheritedPom.inheritedTool",
        description: "Use the inherited tool.",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
        parameters: [
          {
            name: "value",
            optional: false,
            schema: { type: "string" },
          },
        ],
      },
    ]);
  });

  it("accepts selected Page and Locator members, including browser-emulated actions", () => {
    expect(() => manifestFor("selectedCompatibilityPom")).not.toThrow();
  });

  it("rejects compatible members that are not selected for the current runtime", () => {
    expect(() => manifestFor("unselectedCompatibilityPom")).toThrow(
      "Playwright member Locator.page is compatible but unavailable in the current browser runtime."
    );
  });

  it("rejects partially compatible members that are not selected for the current runtime", () => {
    const member = compatibilityMember("Locator.page");
    const api = member.api;
    member.api = "Partial";

    try {
      expect(() => manifestFor("unselectedCompatibilityPom")).toThrow(
        "Playwright member Locator.page is compatible but unavailable in the current browser runtime."
      );
    } finally {
      member.api = api;
    }
  });

  it("rejects architecturally unsupported members", () => {
    expect(() => manifestFor("unsupportedCompatibilityPom")).toThrow(
      "Playwright member Page.goto is architecturally unsupported."
    );
  });

  it("checks inherited decorated tools", () => {
    expect(() => manifestFor("inheritedCompatibilityPom")).toThrow(
      "Playwright member Locator.hover is compatible but unavailable in the current browser runtime."
    );
  });

  it("checks generic inherited decorated tools", () => {
    expect(() => manifestFor("genericInheritedCompatibilityPom")).toThrow(
      "Playwright member Locator.hover is compatible but unavailable in the current browser runtime."
    );
  });

  it("rejects calls absent from the compatibility catalog", () => {
    const catalog = compatibilityCatalog as CompatibilityMember[];
    const index = catalog.findIndex(
      (member) => member.interface === "Page" && member.member === "goto"
    );
    const [member] = catalog.splice(index, 1);

    try {
      expect(() => manifestFor("unsupportedCompatibilityPom")).toThrow(
        "Playwright member Page.goto is not classified in the compatibility catalog."
      );
    } finally {
      catalog.splice(index, 0, member!);
    }
  });

  it("rejects invalid decorated tools", () => {
    expect(() => manifestFor("invalidDecoratedToolPom")).toThrow(
      "WebMCP tool InvalidDecoratedToolPom.run needs a string description."
    );
  });

  it("fails closed when current support drifts from the catalog", () => {
    const support = currentSupport as unknown as string[];
    support.push("Page.goto");

    try {
      expect(() => manifestFor("selectedCompatibilityPom")).toThrow(
        "Selected Playwright member Page.goto is not fully compatible in the catalog."
      );
    } finally {
      support.pop();
    }
  });

  it("fails closed when current support names a member absent from the catalog", () => {
    const support = currentSupport as unknown as string[];
    support.push("Page.missingFromCatalog");

    try {
      expect(() => manifestFor("selectedCompatibilityPom")).toThrow(
        "Selected Playwright member Page.missingFromCatalog is absent from the catalog."
      );
    } finally {
      support.pop();
    }
  });

  it("fails closed when a selected member is absent from Playwright's actual types", () => {
    const catalog = compatibilityCatalog as CompatibilityMember[];
    const support = currentSupport as unknown as string[];
    catalog.push({
      interface: "Page",
      member: "removedMember",
      api: "Full",
      execution: "Matched",
    });
    support.push("Page.removedMember");

    try {
      expect(() => manifestFor("selectedCompatibilityPom")).toThrow(
        "Selected Playwright member Page.removedMember does not exist on @playwright/test Page."
      );
    } finally {
      support.pop();
      catalog.pop();
    }
  });

  it("collects public members and tools through multi-level inheritance", () => {
    const manifest = manifestFor("multiLevelInheritedPom");
    if (!manifest) throw new Error("The POM manifest was not derived.");

    expect(manifest.members).toEqual(
      expect.arrayContaining([
        {
          memberName: "ownButton",
          kind: "locator",
          access: "field",
        },
        {
          memberName: "middleButton",
          kind: "locator",
          access: "field",
        },
        {
          memberName: "inheritedButton",
          kind: "locator",
          access: "field",
        },
        {
          memberName: "overriddenButton",
          kind: "locator",
          access: "field",
        },
      ])
    );
    expect(manifest.members).toHaveLength(4);
    expect(
      new Set(manifest.members.map((member) => member.memberName)).size
    ).toBe(4);
    expect(manifest.members).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberName: "basePrivateButton" }),
        expect.objectContaining({ memberName: "baseProtectedButton" }),
        expect.objectContaining({ memberName: "middlePrivateButton" }),
        expect.objectContaining({ memberName: "middleProtectedButton" }),
        expect.objectContaining({ memberName: "finalPrivateButton" }),
        expect.objectContaining({ memberName: "finalProtectedButton" }),
      ])
    );

    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          methodName: "inheritedTool",
          toolName: "MultiLevelInheritedPom.inheritedTool",
          description: "Use the inherited base tool.",
        }),
        expect.objectContaining({
          methodName: "middleTool",
          toolName: "MultiLevelInheritedPom.middleTool",
          description: "Use the inherited middle tool.",
        }),
        expect.objectContaining({
          methodName: "overriddenTool",
          toolName: "MultiLevelInheritedPom.overriddenTool",
          description: "Use the final override tool.",
        }),
      ])
    );
    expect(manifest.tools).toHaveLength(3);
    expect(new Set(manifest.tools.map((tool) => tool.methodName)).size).toBe(3);
    expect(manifest.tools).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ methodName: "basePrivateTool" }),
        expect.objectContaining({ methodName: "baseProtectedTool" }),
      ])
    );
  });
});

function compatibilityMember(key: string) {
  const [interfaceName, memberName] = key.split(".");
  const member = (compatibilityCatalog as CompatibilityMember[]).find(
    (candidate) =>
      candidate.interface === interfaceName && candidate.member === memberName
  );
  if (!member) throw new Error(`Missing compatibility fixture member ${key}.`);
  return member;
}
