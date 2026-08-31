import { describe, expect, it } from "vitest";
import {
  AriaRefSchema,
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/structural-observation";

describe("SyntheticAriaRefFactory", () => {
  it("returns a fresh reserved synthetic ref for every create", () => {
    const factory = new SyntheticAriaRefFactory();

    const first = factory.create();
    const second = factory.create();

    expect(first).toBe("s_1");
    expect(second).toBe("s_2");
    expect(first).not.toBe(second);
  });

  it("reserves s_root outside the counter sequence", () => {
    const factory = new SyntheticAriaRefFactory();
    expect(factory.create()).not.toBe("s_root");
  });
});

describe("StructuralTree parsing with a shared factory", () => {
  const SNAPSHOT = `
- generic [ref=e1]:
  - textbox "Todo" [ref=e14]
`.trim();

  it("keeps literal Playwright refs across snapshots", () => {
    const factory = new SyntheticAriaRefFactory();

    const first = StructuralTree.fromAriaSnapshotYaml(SNAPSHOT, factory);
    const second = StructuralTree.fromAriaSnapshotYaml(SNAPSHOT, factory);

    const firstTextbox = first.getNode(AriaRefSchema.parse("e14"));
    const secondTextbox = second.getNode(AriaRefSchema.parse("e14"));

    expect(firstTextbox).not.toBeNull();
    expect(secondTextbox?.ref).toBe(firstTextbox?.ref);
  });

  it("allocates synthetic refs only for ref-less nodes", () => {
    const factory = new SyntheticAriaRefFactory();

    const tree = StructuralTree.fromAriaSnapshotYaml(
      '- generic\n- button "Literal" [ref=e9]',
      factory
    );

    expect(tree.getRootNodes().map((node) => node.ref)).toEqual(["s_1", "e9"]);
  });
});
