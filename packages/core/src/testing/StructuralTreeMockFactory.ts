import type {
  JsonValue,
  StructuralEnrichmentKind,
} from "../tree/StructuralEnrichment";
import { StructuralNode } from "../tree/StructuralNode";
import { StructuralTree } from "../tree/StructuralTree";
import { SyntheticAriaRefFactory } from "../tree/SyntheticAriaRefFactory";

const DEFAULT_YAML = '- heading "Test" [ref=e1]';

type CreateMockTreeOptions = {
  yaml?: string;
  idFactory?: SyntheticAriaRefFactory;
};

type CreateEnrichedTreeOptions<T extends JsonValue> = {
  yaml?: string;
  enrichment: StructuralEnrichmentKind<T>;
  enrichmentByRef?: Record<string, T>;
  idFactory?: SyntheticAriaRefFactory;
};

export class StructuralTreeMockFactory {
  /** Builds a plain structural tree by parsing YAML (ids are derived deterministically). */
  static createTree(options: CreateMockTreeOptions = {}): StructuralTree {
    return StructuralTree.fromAriaSnapshotYaml(
      options.yaml ?? DEFAULT_YAML,
      options.idFactory ?? new SyntheticAriaRefFactory()
    );
  }

  /**
   * Builds a structural tree and attaches enrichment to nodes whose ref
   * appears in `enrichmentByRef`. Nodes without a matching ref stay unenriched.
   */
  static createEnrichedTree<T extends JsonValue>(
    options: CreateEnrichedTreeOptions<T>
  ): StructuralTree {
    const idFactory = options.idFactory ?? new SyntheticAriaRefFactory();
    const tree = StructuralTree.fromAriaSnapshotYaml(
      options.yaml ?? DEFAULT_YAML,
      idFactory
    );
    const enrichmentByRef = options.enrichmentByRef ?? {};
    const attach = (node: StructuralNode): StructuralNode => {
      const children = node.children.map((child) =>
        typeof child === "string" ? child : attach(child)
      );
      const rebuilt = node.copy({ children });
      const enrichment = enrichmentByRef[node.ref];
      return enrichment === undefined
        ? rebuilt
        : rebuilt.attachEnrichment(options.enrichment, enrichment);
    };
    return new StructuralTree(attach(tree.root), idFactory);
  }
}
