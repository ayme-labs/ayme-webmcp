import type { StructuralNode } from "./StructuralNode";
import type { StructuralTree } from "./StructuralTree";
import type { AriaRef } from "./StructuralTypes";

export type StructuralNodeProperty = {
  name: string;
  value: string | readonly string[];
};

export type ProjectedStructuralNode = {
  node: StructuralNode;
  children: readonly (ProjectedStructuralNode | string)[];
  properties: readonly StructuralNodeProperty[];
};

/** Selects ref-addressed output properties before data reaches a renderer. */
export class StructuralProjection {
  project(
    tree: StructuralTree,
    properties: ReadonlyMap<AriaRef, readonly StructuralNodeProperty[]>
  ): readonly ProjectedStructuralNode[] {
    const projectNode = (node: StructuralNode): ProjectedStructuralNode => ({
      node,
      children: node.children.map((child) =>
        typeof child === "string" ? child : projectNode(child)
      ),
      properties: properties.get(node.ref) ?? [],
    });

    return tree.getRootNodes().map(projectNode);
  }
}
