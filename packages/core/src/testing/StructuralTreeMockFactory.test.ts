import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineStructuralEnrichment } from "../tree/StructuralEnrichment";
import { AriaRefSchema } from "../tree/StructuralTypes";
import { StructuralTreeMockFactory } from "./StructuralTreeMockFactory";

const NESTED = `
- generic [ref=e1]:
  - button "Go" [ref=e2]
`.trim();

const component = defineStructuralEnrichment({
  key: "component",
  schema: z.object({ name: z.string() }),
  properties: { name: (value) => value.name },
  hasChanged: (before, after) => before?.name !== after?.name,
});

describe("StructuralTreeMockFactory", () => {
  it("builds a tree from YAML with deterministic refs", () => {
    const tree = StructuralTreeMockFactory.createTree({ yaml: NESTED });

    expect(tree.getAllRefs().map(String)).toEqual(["e1", "e2"]);
    expect(tree.getNode(AriaRefSchema.parse("e2"))?.name).toBe("Go");
  });

  it("uses a default single-node tree when no yaml is given", () => {
    const tree = StructuralTreeMockFactory.createTree();

    expect(tree.getAllNodes()).toHaveLength(1);
    expect(tree.getRootNodes()[0]?.role).toBe("heading");
  });

  it("attaches enrichment to selected nodes by ref", () => {
    const tree = StructuralTreeMockFactory.createEnrichedTree({
      yaml: NESTED,
      enrichment: component,
      enrichmentByRef: {
        e2: { name: "GoButton" },
      },
    });

    const button = tree.getNode(AriaRefSchema.parse("e2"));
    expect(button?.enrichmentValue(component)).toEqual({ name: "GoButton" });

    const generic = tree.getNode(AriaRefSchema.parse("e1"));
    expect(generic?.enrichmentValue(component)).toBeUndefined();
  });
});
