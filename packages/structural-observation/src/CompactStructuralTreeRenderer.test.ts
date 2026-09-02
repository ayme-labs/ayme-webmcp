import { describe, expect, it } from "vitest";
import {
  AriaRefSchema,
  renderCompactStructuralNodeForest,
  StructuralProjection,
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/structural-observation";

describe("renderCompactStructuralNodeForest", () => {
  it("renders the accepted ref-first root-only POM contract", () => {
    const tree = StructuralTree.fromAriaSnapshotYaml(
      `
- listitem [ref=e1]:
  - button "Archive item-1" [ref=e2]
`.trim(),
      new SyntheticAriaRefFactory()
    );

    expect(
      renderCompactStructuralNodeForest({
        roots: new StructuralProjection().project(
          tree,
          new Map([
            [
              AriaRefSchema.parse("e1"),
              [{ name: "pom", value: "ListPage.items[0]" }],
            ],
          ])
        ),
        structuralNode: (node) => node.node,
        children: (node) => node.children,
        properties: (node) => node.properties,
      })
    ).toBe(
      `
- [ref=e1] listitem:
  - /pom: "ListPage.items[0]"
  - [ref=e2] button "Archive item-1"
`.trim()
    );
  });
});
