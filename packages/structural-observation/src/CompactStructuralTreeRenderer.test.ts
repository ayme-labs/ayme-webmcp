import { describe, expect, it } from "vitest";
import {
  AriaRefSchema,
  renderCompactStructuralNodeForest,
  StructuralProjection,
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/structural-observation";

describe("renderCompactStructuralNodeForest", () => {
  it("renders refs and single POM labels inline", () => {
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
            [
              AriaRefSchema.parse("e2"),
              [{ name: "pom", value: "ListPage.items[0].archiveButton" }],
            ],
          ])
        ),
        structuralNode: (node) => node.node,
        children: (node) => node.children,
        properties: (node) => node.properties,
      })
    ).toMatchInlineSnapshot(`
      "- e1 ListPage.items[0]:
        - e2 ListPage.items[0].archiveButton "Archive item-1""
    `);
  });

  it("omits generic roles while retaining their structural refs", () => {
    const tree = StructuralTree.fromAriaSnapshotYaml(
      `
- generic [ref=e1]:
  - generic "Wrapper" [ref=e2]:
    - button "Create" [ref=e3]
`.trim(),
      new SyntheticAriaRefFactory()
    );

    expect(
      renderCompactStructuralNodeForest({
        roots: new StructuralProjection().project(tree, new Map()),
        structuralNode: (node) => node.node,
        children: (node) => node.children,
        properties: (node) => node.properties,
      })
    ).toMatchInlineSnapshot(`
      "- e1:
        - e2 "Wrapper":
          - e3 button "Create""
    `);
  });

  it("keeps multiple POM labels as an explicit property", () => {
    const tree = StructuralTree.fromAriaSnapshotYaml(
      `
- listitem [ref=e1]:
  - button "Archive" [ref=e2]
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
              [{ name: "pom", value: ["PageA.item", "PageB.item"] }],
            ],
          ])
        ),
        structuralNode: (node) => node.node,
        children: (node) => node.children,
        properties: (node) => node.properties,
      })
    ).toMatchInlineSnapshot(`
      "- e1 listitem:
        - /pom: ["PageA.item","PageB.item"]
        - e2 button "Archive""
    `);
  });

  it("renders synthetic refs with single POM labels inline", () => {
    const tree = StructuralTree.fromAriaSnapshotYaml(
      `
- generic [ref=e1]:
  - generic [ref=s_1]:
    - button "Create" [ref=e2]
`.trim(),
      new SyntheticAriaRefFactory()
    );

    expect(
      renderCompactStructuralNodeForest({
        roots: new StructuralProjection().project(
          tree,
          new Map([
            [
              AriaRefSchema.parse("s_1"),
              [{ name: "pom", value: "Page.synthetic" }],
            ],
          ])
        ),
        structuralNode: (node) => node.node,
        children: (node) => node.children,
        properties: (node) => node.properties,
      })
    ).toMatchInlineSnapshot(`
      "- e1:
        - s_1 Page.synthetic:
          - e2 button "Create""
    `);
  });
});
