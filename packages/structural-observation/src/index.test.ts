import { describe, expect, it } from "vitest";
import {
  AriaRefSchema,
  PlaywrightLocatorStringSchema,
  StructuralNode,
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/structural-observation";

describe("structural observation public export", () => {
  it("exports the structural kernel through the package interface", () => {
    expect(AriaRefSchema).toBeDefined();
    expect(PlaywrightLocatorStringSchema).toBeDefined();
    expect(StructuralNode).toBeDefined();
    expect(StructuralTree).toBeDefined();
    expect(SyntheticAriaRefFactory).toBeDefined();
  });
});
