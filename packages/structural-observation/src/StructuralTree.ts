import {
  AriaRefSchema,
  type AriaRef,
  type PlaywrightLocatorString,
} from "./StructuralTypes";
import type { SyntheticAriaRefAllocator } from "./SyntheticAriaRefFactory";
import {
  parseStructuralRole,
  StructuralNode,
  type StructuralChild,
  type StructuralNodeEnrichment,
  type StructuralNodeState,
  type StructuralNodeStatus,
  type StructuralNodeStatusKind,
  type StructuralRole,
  type VisibilityChangeStatus,
} from "./StructuralNode";

type EnrichNodeFn = (
  node: StructuralNode
) => Promise<StructuralNodeEnrichment | null> | StructuralNodeEnrichment | null;

type NodeMatch = {
  matchedBeforeIndex?: number;
  child: StructuralChild;
};

type ReconciledChildren = {
  children: StructuralChild[];
  childListChanged: boolean;
};

type ParsedAttributeMap = {
  ref?: string;
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  active?: boolean;
  selected?: boolean;
  pressed?: boolean | "mixed";
  level?: number;
  cursorPointer?: boolean;
};

type ParsedNodeLine = {
  role: StructuralRole;
  name: string;
  attributes: ParsedAttributeMap;
  inlineText?: string;
};

type MutableNodeFrame = {
  ref?: AriaRef;
  role: StructuralRole;
  name: string;
  state: StructuralNodeState;
  cursorPointer: boolean;
  props: Record<string, string>;
  children: Array<MutableNodeFrame | string>;
};

type BeforeStateMap = Map<AriaRef, StructuralNode>;

type ReconciliationMetadata = {
  readonly beforeByRef: ReadonlyMap<AriaRef, StructuralNode>;
  readonly beforeByAfterRef: ReadonlyMap<AriaRef, StructuralNode>;
  readonly ambiguousBeforeRefs: ReadonlySet<AriaRef>;
};

type RefAllocator = { resolve(desiredRef: AriaRef): AriaRef };

/**
 * Shared state threaded through a single reconciliation. Because every tree in a
 * visit is parsed with one {@link SyntheticAriaRefFactory}, the same element
 * carries the same ref across the before and after snapshots. That makes refs
 * authoritative identity within a reconciliation:
 *
 * - `beforeNodesByRef` lets an after node claim its before counterpart even when
 *   it has moved to a different parent (e.g. nested beneath a newly inserted
 *   wrapper), so it keeps its ref instead of being re-minted as an addition.
 * - `afterNodesByRef` lets the removed pass suppress a before node whose compatible
 *   identity is retained anywhere in the after tree — the node moved rather than left.
 * - `consumedBeforeRefs` guards against a before node being claimed twice.
 */
type ReconcileContext = {
  beforeByRef: BeforeStateMap;
  beforeByAfterRef: BeforeStateMap;
  beforeNodesByRef: ReadonlyMap<AriaRef, StructuralNode>;
  afterNodesByRef: ReadonlyMap<AriaRef, StructuralNode>;
  ambiguousBeforeRefs: Set<AriaRef>;
  consumedBeforeRefs: Set<AriaRef>;
  refAllocator: RefAllocator;
};

type TreeNavigation = {
  ordered: StructuralNode[];
  byRef: Map<AriaRef, StructuralNode>;
  parentByRef: Map<AriaRef, StructuralNode | null>;
  depthByRef: Map<AriaRef, number>;
  roots: StructuralNode[];
};

export type ReferencedCapturedRoot = {
  kind: "referenced";
  ref: AriaRef;
};

export type OmittedCapturedRoot = {
  kind: "omitted";
  ancestorRef: AriaRef | undefined;
  descendantRefs: readonly AriaRef[];
  role: StructuralRole;
  name: string;
};

export type CapturedStructuralRoot =
  ReferencedCapturedRoot | OmittedCapturedRoot;

export type CapturedStructuralRootPlacement = {
  tree: StructuralTree;
  refs: readonly (AriaRef | null)[];
};

export class StructuralTree {
  readonly root: StructuralNode;

  /**
   * Reconciliation before-state, owned privately by the tree. Retained as
   * reconciliation metadata for potential internal use; it is intentionally not
   * surfaced in any serialized timeline output.
   */
  private readonly _reconciliation: ReconciliationMetadata;

  private readonly _refFactory: SyntheticAriaRefAllocator;

  private _navigation: TreeNavigation | null = null;

  constructor(
    root: StructuralNode,
    refFactory: SyntheticAriaRefAllocator,
    reconciliation?: ReconciliationMetadata
  ) {
    this.root = root;
    this._refFactory = refFactory;
    this._reconciliation = reconciliation ?? {
      beforeByRef: new Map(),
      beforeByAfterRef: new Map(),
      ambiguousBeforeRefs: new Set(),
    };
  }

  /**
   * Visits every structural node in canonical preorder, matching getAllNodes().
   * The synthetic fragment wrapper used for multi-root inputs is never visited;
   * its children are treated as the semantic top level.
   */
  walk(visitor: (node: StructuralNode) => void): void {
    for (const node of this._nav().ordered) visitor(node);
  }

  /** Returns the node with the given ref, or null when it is not in the tree. */
  getNode(ref: AriaRef): StructuralNode | null {
    return this._nav().byRef.get(ref) ?? null;
  }

  /** Returns the prior snapshot state for an updated reconciled node. */
  getBeforeNode(ref: AriaRef): StructuralNode | null {
    return this._reconciliation.beforeByRef.get(ref) ?? null;
  }

  /** Returns the before-state node matched to a raw after-snapshot ref. */
  getBeforeNodeForAfterRef(ref: AriaRef): StructuralNode | null {
    return this._reconciliation.beforeByAfterRef.get(ref) ?? null;
  }

  /** Reports whether a before-state ref had multiple compatible candidates. */
  wasBeforeRefAmbiguous(ref: AriaRef): boolean {
    return this._reconciliation.ambiguousBeforeRefs.has(ref);
  }

  /** Reports whether a node with the given ref exists in the tree. */
  hasNode(ref: AriaRef): boolean {
    return this._nav().byRef.has(ref);
  }

  /** Returns all node refs in canonical preorder. */
  getAllRefs(): AriaRef[] {
    return this._nav().ordered.map((node) => node.ref);
  }

  /** Returns all nodes in canonical preorder. */
  getAllNodes(): StructuralNode[] {
    return [...this._nav().ordered];
  }

  /** Returns the semantic top-level roots, hiding any synthetic fragment wrapper. */
  getRootNodes(): StructuralNode[] {
    return [...this._nav().roots];
  }

  /** Returns the direct parent of a node, or null for a root or unknown ref. */
  getParentOf(ref: AriaRef): StructuralNode | null {
    return this._nav().parentByRef.get(ref) ?? null;
  }

  /** Returns ancestors nearest-first (direct parent up to the root); empty for a root or unknown ref. */
  getAncestorsOf(ref: AriaRef): StructuralNode[] {
    const nav = this._nav();
    const ancestors: StructuralNode[] = [];
    const visited = new Set<AriaRef>([ref]);
    let parent = nav.parentByRef.get(ref) ?? null;
    while (parent !== null) {
      if (visited.has(parent.ref))
        throw new Error(
          `Structural tree contains a parent cycle at ${parent.ref}`
        );
      visited.add(parent.ref);
      ancestors.push(parent);
      parent = nav.parentByRef.get(parent.ref) ?? null;
    }
    return ancestors;
  }

  /** Returns the nesting depth (0 for roots), or null for an unknown ref. */
  getDepthOf(ref: AriaRef): number | null {
    return this._nav().depthByRef.get(ref) ?? null;
  }

  /** Returns the first node enriched with the given locator, or null when it is absent. */
  findByLocator(locator: PlaywrightLocatorString): StructuralNode | null {
    for (const node of this._nav().ordered) {
      if (node.enrichment?.locators.includes(locator)) return node;
    }
    return null;
  }

  /**
   * Returns a copy with `child` appended beneath the resolved parent. Selector-resolved supplemental
   * nodes deliberately use the same immutable structural representation as ARIA-captured nodes.
   */
  appendChild(parentRef: AriaRef, child: StructuralNode): StructuralTree {
    if (!this.hasNode(parentRef) || this.hasNode(child.ref)) return this;
    return new StructuralTree(
      StructuralTree._appendChild(this.root, parentRef, child),
      this._refFactory,
      this._reconciliation
    );
  }

  /** Adds a selector-derived locator to an existing node without changing its ref. */
  addLocator(
    nodeRef: AriaRef,
    locator: PlaywrightLocatorString
  ): StructuralTree {
    const node = this.getNode(nodeRef);
    if (!node || node.enrichment?.locators.includes(locator)) return this;

    const enrichment = {
      locators: [...(node.enrichment?.locators ?? []), locator],
      strippedHtml: node.enrichment?.strippedHtml ?? "",
    };
    return new StructuralTree(
      StructuralTree._replaceNode(this.root, nodeRef, (current) =>
        current.enrich(enrichment)
      ),
      this._refFactory,
      this._reconciliation
    );
  }

  /** Returns all nodes carrying the given reconciliation status, in preorder. */
  getNodesByStatus(status: StructuralNodeStatusKind): StructuralNode[] {
    return this._nav().ordered.filter((node) => node.status?.kind === status);
  }

  /** Returns the semantic top-level (page/document) roots carrying the given reconciliation status. */
  getTopLevelRootsByStatus(status: StructuralNodeStatusKind): StructuralNode[] {
    return this._nav().roots.filter((node) => node.status?.kind === status);
  }

  /**
   * Returns the outermost changed nodes carrying the given reconciliation
   * status: every node whose status matches and that has no ancestor with the
   * same status.
   *
   * When a whole subtree is added or removed, reconciliation marks every node in
   * that subtree with the status, so the visible change is the topmost node of
   * each such subtree. Unlike {@link getTopLevelRootsByStatus}, this also
   * surfaces added/removed subtrees nested under unchanged or updated ancestors,
   * which is what preserves nested visibility effects rather than only top-level
   * ones.
   *
   * Restricted to {@link VisibilityChangeStatus} because only added/removed
   * carry visibility meaning; `unchanged`/`updated` subtree roots are not a
   * coherent concept here.
   */
  getChangeRootsByStatus(status: VisibilityChangeStatus): StructuralNode[] {
    const nav = this._nav();
    return nav.ordered.filter((node) => {
      if (node.status?.kind !== status) return false;
      let parent = nav.parentByRef.get(node.ref) ?? null;
      while (parent !== null) {
        if (parent.status?.kind === status) return false;
        parent = nav.parentByRef.get(parent.ref) ?? null;
      }
      return true;
    });
  }

  /**
   * Reports whether reconciliation marked any node as added, removed, or changed.
   * A freshly parsed (unreconciled) tree carries no statuses and returns false.
   */
  hasAnyChanges(): boolean {
    return this._nav().ordered.some(
      (node) =>
        node.status?.kind === "added" ||
        node.status?.kind === "removed" ||
        node.status?.kind === "updated"
    );
  }

  /**
   * Projects this (possibly reconciled) tree to a clean current-state tree:
   * nodes marked `removed` are dropped, all reconciliation statuses are cleared,
   * and every kept node preserves its reconciled `ref`,
   * `role`, `name`, `state`, `props`, `cursorPointer`, text/node children, and
   * enrichment. The result carries no reconciliation before-state, so it is
   * suitable as a canonical post-action current tree whose refs stay stable when
   * used as the next reconciliation baseline.
   */
  toCurrentTree(): StructuralTree {
    return new StructuralTree(
      StructuralTree._projectCurrentNode(this.root),
      this._refFactory
    );
  }

  private static _projectCurrentNode(node: StructuralNode): StructuralNode {
    const children: StructuralChild[] = [];
    for (const child of node.children) {
      if (typeof child === "string") {
        children.push(child);
        continue;
      }
      if (child.status?.kind === "removed") continue;
      children.push(StructuralTree._projectCurrentNode(child));
    }

    return new StructuralNode({
      ref: node.ref,
      status: undefined,
      role: node.role,
      name: node.name,
      state: node.state,
      cursorPointer: node.cursorPointer,
      props: { ...node.props },
      children,
      enrichment: node.enrichment,
    });
  }

  private _nav(): TreeNavigation {
    if (this._navigation !== null) return this._navigation;

    const roots =
      this.root.role === "fragment"
        ? this.root.children.filter(
            (child): child is StructuralNode => typeof child !== "string"
          )
        : [this.root];

    const ordered: StructuralNode[] = [];
    const byRef = new Map<AriaRef, StructuralNode>();
    const parentByRef = new Map<AriaRef, StructuralNode | null>();
    const depthByRef = new Map<AriaRef, number>();

    const visit = (
      node: StructuralNode,
      parent: StructuralNode | null,
      depth: number
    ) => {
      ordered.push(node);
      byRef.set(node.ref, node);
      parentByRef.set(node.ref, parent);
      depthByRef.set(node.ref, depth);
      for (const child of node.children) {
        if (typeof child !== "string") visit(child, node, depth + 1);
      }
    };
    for (const root of roots) visit(root, null, 0);

    this._navigation = { ordered, byRef, parentByRef, depthByRef, roots };
    return this._navigation;
  }

  /**
   * Walks the whole tree and attaches caller-derived enrichment to each node.
   * The callback is invoked for every structural node and may return enrichment
   * synchronously or asynchronously; a `null` result leaves that node's
   * enrichment untouched. A new tree is returned and this tree is not mutated.
   */
  async enrich(enrichNode: EnrichNodeFn): Promise<StructuralTree> {
    const root = await StructuralTree._enrichNode(this.root, enrichNode);
    return new StructuralTree(root, this._refFactory, this._reconciliation);
  }

  /**
   * Collapses the implementation-detail descendants of inline SVG roots while preserving the
   * root's structural ref and own enrichment. SVG descendants cannot be interaction targets,
   * so keeping them would only add noisy path/group nodes to later analysis and reconciliation.
   */
  collapseSvgSubtrees(): StructuralTree {
    const root = StructuralTree._collapseSvgSubtree(this.root);
    return new StructuralTree(root, this._refFactory, this._reconciliation);
  }

  private static _collapseSvgSubtree(node: StructuralNode): StructuralNode {
    if (StructuralTree._isSvgRoot(node))
      return StructuralTree._rebuildWithChildren(node, []);

    const children = node.children.map((child) =>
      typeof child === "string"
        ? child
        : StructuralTree._collapseSvgSubtree(child)
    );
    return StructuralTree._rebuildWithChildren(node, children);
  }

  private static _isSvgRoot(node: StructuralNode): boolean {
    return /^\s*<svg(?:\s|>)/i.test(node.enrichment?.strippedHtml ?? "");
  }

  private static async _enrichNode(
    node: StructuralNode,
    enrichNode: EnrichNodeFn
  ): Promise<StructuralNode> {
    const enrichedChildren: StructuralChild[] = [];
    for (const child of node.children) {
      enrichedChildren.push(
        typeof child === "string"
          ? child
          : await StructuralTree._enrichNode(child, enrichNode)
      );
    }

    const enrichment = await enrichNode(node);
    const rebuilt = StructuralTree._rebuildWithChildren(node, enrichedChildren);
    return enrichment === null ? rebuilt : rebuilt.enrich(enrichment);
  }

  private static _rebuildWithChildren(
    node: StructuralNode,
    children: StructuralChild[]
  ): StructuralNode {
    return new StructuralNode({
      ref: node.ref,
      status: node.status,
      role: node.role,
      name: node.name,
      state: node.state,
      cursorPointer: node.cursorPointer,
      props: { ...node.props },
      children,
      enrichment: node.enrichment,
    });
  }

  private static _appendChild(
    node: StructuralNode,
    parentRef: AriaRef,
    child: StructuralNode
  ): StructuralNode {
    if (node.ref === parentRef) {
      return StructuralTree._rebuildWithChildren(node, [
        ...node.children,
        child,
      ]);
    }

    const children = node.children.map((candidate) =>
      typeof candidate === "string"
        ? candidate
        : StructuralTree._appendChild(candidate, parentRef, child)
    );
    return StructuralTree._rebuildWithChildren(node, children);
  }

  private static _replaceNode(
    node: StructuralNode,
    nodeRef: AriaRef,
    replacement: (node: StructuralNode) => StructuralNode
  ): StructuralNode {
    if (node.ref === nodeRef) return replacement(node);
    return StructuralTree._rebuildWithChildren(
      node,
      node.children.map((child) =>
        typeof child === "string"
          ? child
          : StructuralTree._replaceNode(child, nodeRef, replacement)
      )
    );
  }

  static fromAriaSnapshotYaml(
    yaml: string,
    refFactory: SyntheticAriaRefAllocator
  ): StructuralTree {
    return StructuralTree._fromRoots(
      StructuralTree._parseRoots(yaml, refFactory, true),
      refFactory
    );
  }

  /** Builds a capture tree from Playwright-owned refs, promoting ref-less wrappers. */
  static fromPlaywrightAriaSnapshotYaml(
    yaml: string,
    refFactory: SyntheticAriaRefAllocator
  ): StructuralTree {
    return StructuralTree._fromRoots(
      StructuralTree._parseRoots(yaml, refFactory, false),
      refFactory
    );
  }

  private static _fromRoots(
    roots: StructuralChild[],
    refFactory: SyntheticAriaRefAllocator
  ): StructuralTree {
    const onlyRoot = roots[0];
    if (
      roots.length === 1 &&
      onlyRoot !== undefined &&
      typeof onlyRoot !== "string"
    )
      return new StructuralTree(onlyRoot, refFactory);

    const root = new StructuralNode({
      ref: AriaRefSchema.parse("s_root"),
      role: "fragment",
      name: "",
      cursorPointer: false,
      children: roots,
    });
    return new StructuralTree(root, refFactory);
  }

  /** Places captured roots using full-tree ancestry and retained-tree order. */
  placeCapturedRoots(
    fullTree: StructuralTree,
    roots: readonly CapturedStructuralRoot[]
  ): CapturedStructuralRootPlacement {
    let tree = new StructuralTree(
      this.root,
      this._refFactory,
      this._reconciliation
    );
    const placedRefs: Array<AriaRef | null> = [];
    const fullOrder = new Map(
      fullTree.getAllRefs().map((ref, index) => [ref, index] as const)
    );

    for (const root of roots) {
      if (root.kind === "referenced") {
        if (tree.hasNode(root.ref)) {
          placedRefs.push(root.ref);
          continue;
        }

        const fullNode = fullTree.getNode(root.ref);
        const ancestor = fullTree
          .getAncestorsOf(root.ref)
          .find((candidate) => tree.hasNode(candidate.ref));
        if (!fullNode || !ancestor) {
          placedRefs.push(null);
          continue;
        }

        const boundary = StructuralTree._capturedBoundary(fullNode, tree);
        tree = StructuralTree._insertBoundary(
          tree,
          ancestor.ref,
          boundary,
          StructuralTree._descendantRefs(boundary),
          fullOrder.get(root.ref) ?? Number.MAX_SAFE_INTEGER,
          fullOrder
        );
        placedRefs.push(tree.hasNode(root.ref) ? root.ref : null);
        continue;
      }

      const descendantRefs = [
        ...new Set(
          root.descendantRefs.filter(
            (ref) => tree.hasNode(ref) && fullTree.hasNode(ref)
          )
        ),
      ];
      if (
        root.ancestorRef === undefined ||
        !tree.hasNode(root.ancestorRef) ||
        descendantRefs.length === 0
      ) {
        placedRefs.push(null);
        continue;
      }

      const descendantSet = new Set(descendantRefs);
      const topLevelDescendants = descendantRefs.filter(
        (ref) =>
          !tree
            .getAncestorsOf(ref)
            .some((ancestor) => descendantSet.has(ancestor.ref))
      );
      const children = topLevelDescendants.flatMap((ref) => {
        const node = tree.getNode(ref);
        return node ? [node] : [];
      });
      if (children.length === 0) {
        placedRefs.push(null);
        continue;
      }

      const syntheticRef = tree._refFactory.create();
      const boundary = new StructuralNode({
        ref: syntheticRef,
        role: root.role,
        name: root.name,
        cursorPointer: false,
        children,
      });
      const boundaryOrder = Math.min(
        ...topLevelDescendants.map(
          (ref) => fullOrder.get(ref) ?? Number.MAX_SAFE_INTEGER
        )
      );
      tree = StructuralTree._insertBoundary(
        tree,
        root.ancestorRef,
        boundary,
        new Set(topLevelDescendants),
        boundaryOrder,
        fullOrder
      );
      placedRefs.push(tree.hasNode(syntheticRef) ? syntheticRef : null);
    }

    return { tree, refs: placedRefs };
  }

  private static _capturedBoundary(
    node: StructuralNode,
    tree: StructuralTree
  ): StructuralNode {
    return StructuralTree._rebuildWithChildren(
      node,
      node.children.flatMap((child) =>
        typeof child === "string"
          ? []
          : StructuralTree._existingDescendants(child, tree)
      )
    );
  }

  private static _existingDescendants(
    node: StructuralNode,
    tree: StructuralTree
  ): StructuralNode[] {
    const existing = tree.getNode(node.ref);
    if (existing) return [existing];
    return node.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : StructuralTree._existingDescendants(child, tree)
    );
  }

  private static _descendantRefs(node: StructuralNode): Set<AriaRef> {
    const refs = new Set<AriaRef>();
    node.walk((descendant) => {
      if (descendant !== node) refs.add(descendant.ref);
    });
    return refs;
  }

  private static _insertBoundary(
    tree: StructuralTree,
    parentRef: AriaRef,
    boundary: StructuralNode,
    movedRefs: ReadonlySet<AriaRef>,
    boundaryOrder: number,
    fullOrder: ReadonlyMap<AriaRef, number>
  ): StructuralTree {
    let inserted = false;
    const rebuild = (node: StructuralNode): StructuralNode => {
      const children: StructuralChild[] = [];
      for (const child of node.children) {
        if (typeof child !== "string" && movedRefs.has(child.ref)) continue;
        children.push(typeof child === "string" ? child : rebuild(child));
      }

      if (node.ref === parentRef) {
        const insertionIndex = children.findIndex(
          (child) =>
            typeof child !== "string" &&
            StructuralTree._fullTreeOrder(child, fullOrder) > boundaryOrder
        );
        children.splice(
          insertionIndex === -1 ? children.length : insertionIndex,
          0,
          boundary
        );
        inserted = true;
      }
      return StructuralTree._rebuildWithChildren(node, children);
    };

    const root = rebuild(tree.root);
    return inserted
      ? new StructuralTree(root, tree._refFactory, tree._reconciliation)
      : tree;
  }

  private static _fullTreeOrder(
    node: StructuralNode,
    fullOrder: ReadonlyMap<AriaRef, number>
  ): number {
    if (!StructuralTree._isSyntheticRef(node.ref)) {
      const order = fullOrder.get(node.ref);
      if (order !== undefined) return order;
    }

    const descendantOrders = node.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : [StructuralTree._fullTreeOrder(child, fullOrder)]
    );
    return descendantOrders.length > 0
      ? Math.min(...descendantOrders)
      : Number.MAX_SAFE_INTEGER;
  }

  static reconcile(
    before: StructuralTree,
    after: StructuralTree
  ): StructuralTree {
    const beforeByRef: BeforeStateMap = new Map();
    const beforeByAfterRef: BeforeStateMap = new Map();
    const refAllocator = StructuralTree._createAddedRefAllocator(
      before.root,
      before._refFactory
    );
    const beforeNodesByRef = new Map<AriaRef, StructuralNode>();
    before.root.walk((node) => beforeNodesByRef.set(node.ref, node));
    const afterNodesByRef = new Map<AriaRef, StructuralNode>();
    after.root.walk((node) => afterNodesByRef.set(node.ref, node));
    const context: ReconcileContext = {
      beforeByRef,
      beforeByAfterRef,
      beforeNodesByRef,
      afterNodesByRef,
      ambiguousBeforeRefs: new Set(),
      consumedBeforeRefs: new Set(),
      refAllocator,
    };
    const rootsAreCompatible = before.root.role === after.root.role;
    const beforeRoot = rootsAreCompatible
      ? before.root
      : StructuralTree._wrapInFragment(before.root);
    const afterRoot = rootsAreCompatible
      ? after.root
      : StructuralTree._wrapInFragment(after.root);
    const reconciledRoot = StructuralTree._reconcileNode(
      beforeRoot,
      afterRoot,
      context
    );
    const removedRefs = new Set<AriaRef>();
    reconciledRoot.walk((node) => {
      if (node.status?.kind === "removed") removedRefs.add(node.ref);
    });
    const ambiguousBeforeRefs = new Set<AriaRef>();
    for (const ref of context.ambiguousBeforeRefs) {
      const beforeNode = beforeNodesByRef.get(ref);
      beforeNode?.walk((node) => {
        if (removedRefs.has(node.ref)) ambiguousBeforeRefs.add(node.ref);
      });
    }
    return new StructuralTree(reconciledRoot, before._refFactory, {
      beforeByRef,
      beforeByAfterRef,
      ambiguousBeforeRefs,
    });
  }

  private static _wrapInFragment(node: StructuralNode): StructuralNode {
    if (node.role === "fragment") return node;
    return new StructuralNode({
      ref: AriaRefSchema.parse("s_root"),
      role: "fragment",
      name: "",
      cursorPointer: false,
      children: [node],
    });
  }

  /**
   * Resolves refs for added nodes: matched and removed nodes keep their before-tree
   * refs, an added node keeps its own ref unless it collides with the before tree,
   * and a colliding ref is replaced from the same factory.
   */
  private static _createAddedRefAllocator(
    beforeRoot: StructuralNode,
    refFactory: SyntheticAriaRefAllocator
  ): RefAllocator {
    const usedRefs = new Set<string>();
    beforeRoot.walk((node) => usedRefs.add(node.ref));

    return {
      resolve(desiredRef: AriaRef): AriaRef {
        if (!usedRefs.has(desiredRef)) {
          usedRefs.add(desiredRef);
          return desiredRef;
        }
        let candidate = refFactory.create();
        while (usedRefs.has(candidate)) candidate = refFactory.create();
        usedRefs.add(candidate);
        return candidate;
      },
    };
  }

  private static _parseRoots(
    yaml: string,
    refFactory: SyntheticAriaRefAllocator,
    synthesizeRefLess: boolean
  ): StructuralChild[] {
    const rootFrames: Array<MutableNodeFrame | string> = [];
    const stack: Array<{ indent: number; frame: MutableNodeFrame }> = [];

    for (const rawLine of yaml.split("\n")) {
      if (!rawLine.trim()) continue;

      const leadingSpaces = rawLine.match(/^(\s*)/)?.[1]?.length ?? 0;
      const indent = Math.floor(leadingSpaces / 2);
      const trimmedLine = rawLine.trimStart();

      while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent)
        stack.pop();

      if (trimmedLine.startsWith("- /")) {
        const current = stack[stack.length - 1]?.frame;
        if (!current) continue;
        const prop = StructuralTree._parsePropertyLine(trimmedLine);
        current.props[prop.name] = prop.value;
        continue;
      }

      if (trimmedLine.startsWith("- text:")) {
        const current = stack[stack.length - 1]?.frame;
        if (!current) continue;
        const textChild = StructuralTree._parseTextLine(trimmedLine);
        current.children.push(textChild);
        continue;
      }

      const parsedNode = StructuralTree._parseNodeLine(trimmedLine);
      const frame = StructuralTree._createNodeFrame(
        parsedNode,
        refFactory,
        synthesizeRefLess
      );
      if (parsedNode.inlineText !== undefined) {
        frame.children.push(parsedNode.inlineText);
      }

      const parent = stack[stack.length - 1]?.frame;
      if (parent) {
        parent.children.push(frame);
      } else {
        rootFrames.push(frame);
      }
      stack.push({ indent, frame });
    }

    return rootFrames.flatMap((child) =>
      typeof child === "string"
        ? [child]
        : StructuralTree._materializeFrame(child)
    );
  }

  private static _reconcileNode(
    beforeNode: StructuralNode,
    afterNode: StructuralNode,
    context: ReconcileContext
  ): StructuralNode {
    StructuralTree._recordMatchedSubtreeLineage(
      beforeNode,
      afterNode,
      context.beforeByAfterRef
    );
    if (StructuralTree._isReconciliationEqual(beforeNode, afterNode))
      return StructuralTree._preserveUnchangedSubtree(beforeNode, afterNode);

    const reconciledChildren = StructuralTree._reconcileChildren(
      [...beforeNode.children],
      [...afterNode.children],
      context
    );
    return StructuralTree._buildMatchedNode(
      beforeNode,
      afterNode,
      reconciledChildren,
      context.beforeByRef
    );
  }

  private static _reconcileChildren(
    beforeChildren: StructuralChild[],
    afterChildren: StructuralChild[],
    context: ReconcileContext
  ): ReconciledChildren {
    const beforeMatches = new Set<number>();
    const afterMatches = new Set<number>();
    const matches = new Map<number, number>();

    const markStringMatches = () => {
      for (
        let afterIndex = 0;
        afterIndex < afterChildren.length;
        afterIndex += 1
      ) {
        if (afterMatches.has(afterIndex)) continue;
        const afterChild = afterChildren[afterIndex];
        if (typeof afterChild !== "string") continue;
        const candidates = StructuralTree._findStringCandidates(
          beforeChildren,
          beforeMatches,
          afterChild
        );
        if (candidates.length !== 1) continue;
        const beforeIndex = candidates[0];
        if (beforeIndex === undefined) continue;
        beforeMatches.add(beforeIndex);
        afterMatches.add(afterIndex);
        matches.set(afterIndex, beforeIndex);
      }
    };

    const markNodeMatches = (
      comparator: (
        beforeNode: StructuralNode,
        afterNode: StructuralNode
      ) => boolean,
      options?: { onMatch: (beforeNode: StructuralNode) => void }
    ) => {
      const candidatesByAfterIndex = new Map<number, number[]>();
      const afterCandidateCountsByBeforeIndex = new Map<number, number>();
      for (
        let afterIndex = 0;
        afterIndex < afterChildren.length;
        afterIndex += 1
      ) {
        if (afterMatches.has(afterIndex)) continue;
        const afterChild = afterChildren[afterIndex];
        if (afterChild === undefined || typeof afterChild === "string")
          continue;
        const candidates = StructuralTree._findNodeCandidates(
          beforeChildren,
          beforeMatches,
          afterChild,
          comparator
        );
        candidatesByAfterIndex.set(afterIndex, candidates);
        for (const beforeIndex of candidates) {
          afterCandidateCountsByBeforeIndex.set(
            beforeIndex,
            (afterCandidateCountsByBeforeIndex.get(beforeIndex) ?? 0) + 1
          );
        }
      }

      for (const [afterIndex, candidates] of candidatesByAfterIndex) {
        if (candidates.length !== 1) {
          for (const beforeIndex of candidates) {
            const beforeChild = beforeChildren[beforeIndex];
            if (beforeChild !== undefined && typeof beforeChild !== "string")
              context.ambiguousBeforeRefs.add(beforeChild.ref);
          }
          continue;
        }
        const beforeIndex = candidates[0];
        if (beforeIndex === undefined) continue;
        if (afterCandidateCountsByBeforeIndex.get(beforeIndex) !== 1) {
          const beforeChild = beforeChildren[beforeIndex];
          if (beforeChild !== undefined && typeof beforeChild !== "string")
            context.ambiguousBeforeRefs.add(beforeChild.ref);
          continue;
        }
        beforeMatches.add(beforeIndex);
        afterMatches.add(afterIndex);
        matches.set(afterIndex, beforeIndex);
        const beforeChild = beforeChildren[beforeIndex];
        if (
          options &&
          beforeChild !== undefined &&
          typeof beforeChild !== "string"
        )
          options.onMatch(beforeChild);
      }
    };

    markStringMatches();
    // A stable aria ref is authoritative even when the element's role or other attributes change.
    markNodeMatches(
      (beforeNode, afterNode) => beforeNode.ref === afterNode.ref,
      {
        onMatch: (beforeNode) => context.consumedBeforeRefs.add(beforeNode.ref),
      }
    );
    markNodeMatches((beforeNode, afterNode) =>
      beforeNode.isDeepEqual(afterNode)
    );
    // A name appearing or disappearing can be accessibility enrichment rather than a replacement.
    // Keep this exception deliberately narrow: it needs real, deeply equal child content and a unique
    // sibling candidate. A non-empty rename remains add/remove, as do leaf and ambiguous candidates.
    markNodeMatches(
      (beforeNode, afterNode) =>
        StructuralTree._isNamePresenceTransition(beforeNode, afterNode) &&
        beforeNode.isDeepEqualExceptName(afterNode)
    );
    markNodeMatches((beforeNode, afterNode) =>
      beforeNode.isShallowEqual(afterNode)
    );

    const afterResults: NodeMatch[] = afterChildren.map(
      (afterChild, afterIndex) => {
        const matchedBeforeIndex = matches.get(afterIndex);
        if (typeof afterChild === "string")
          return { matchedBeforeIndex, child: afterChild };
        if (matchedBeforeIndex === undefined)
          return {
            matchedBeforeIndex,
            child: StructuralTree._buildAddedSubtree(afterChild, context),
          };

        const beforeChild = beforeChildren[matchedBeforeIndex];
        if (beforeChild === undefined || typeof beforeChild === "string") {
          return {
            matchedBeforeIndex,
            child: StructuralTree._buildAddedSubtree(afterChild, context),
          };
        }
        StructuralTree._recordMatchedSubtreeLineage(
          beforeChild,
          afterChild,
          context.beforeByAfterRef
        );
        if (StructuralTree._isReconciliationEqual(beforeChild, afterChild)) {
          return {
            matchedBeforeIndex,
            child: StructuralTree._preserveUnchangedSubtree(
              beforeChild,
              afterChild
            ),
          };
        }

        const reconciledChildren = StructuralTree._reconcileChildren(
          [...beforeChild.children],
          [...afterChild.children],
          context
        );
        return {
          matchedBeforeIndex,
          child: StructuralTree._buildMatchedNode(
            beforeChild,
            afterChild,
            reconciledChildren,
            context.beforeByRef
          ),
        };
      }
    );

    const removedEntries = beforeChildren
      .map((child, beforeIndex) => ({ child, beforeIndex }))
      .filter(({ beforeIndex }) => !beforeMatches.has(beforeIndex))
      .filter(({ child }) => typeof child !== "string")
      // A before node whose ref is retained anywhere in the after tree moved rather than left; it is
      // emitted once at its after location, so suppress the stale removed duplicate here.
      .filter(({ child }) => {
        const beforeChild = child as StructuralNode;
        const afterNode = context.afterNodesByRef.get(beforeChild.ref);
        return afterNode === undefined || afterNode.role !== beforeChild.role;
      })
      .map(({ child, beforeIndex }) => ({
        beforeIndex,
        child: StructuralTree._buildRemovedSubtree(
          child as StructuralNode,
          context
        ),
      }));

    const output = [...afterResults];
    for (const removedEntry of removedEntries) {
      const insertIndex = output.findIndex(
        (entry) =>
          entry.matchedBeforeIndex !== undefined &&
          entry.matchedBeforeIndex > removedEntry.beforeIndex
      );
      const entry: NodeMatch = {
        matchedBeforeIndex: removedEntry.beforeIndex,
        child: removedEntry.child,
      };
      if (insertIndex === -1) output.push(entry);
      else output.splice(insertIndex, 0, entry);
    }

    const childListChanged = StructuralTree._hasChangedChildList(
      beforeChildren,
      afterChildren,
      matches
    );
    return { children: output.map((entry) => entry.child), childListChanged };
  }

  private static _hasChangedChildList(
    beforeChildren: StructuralChild[],
    afterChildren: StructuralChild[],
    matches: ReadonlyMap<number, number>
  ): boolean {
    const beforeStructuralIndices = beforeChildren.flatMap((child, index) =>
      typeof child === "string" ? [] : [index]
    );
    const afterStructuralIndices = afterChildren.flatMap((child, index) =>
      typeof child === "string" ? [] : [index]
    );
    const matchedBeforeStructuralIndices = afterChildren.flatMap(
      (child, afterIndex) => {
        if (typeof child === "string") return [];
        const beforeIndex = matches.get(afterIndex);
        return beforeIndex === undefined ? [] : [beforeIndex];
      }
    );

    if (
      beforeStructuralIndices.length !==
        matchedBeforeStructuralIndices.length ||
      afterStructuralIndices.length !== matchedBeforeStructuralIndices.length
    )
      return true;
    return beforeStructuralIndices.some(
      (beforeIndex, index) =>
        beforeIndex !== matchedBeforeStructuralIndices[index]
    );
  }

  private static _isNamePresenceTransition(
    beforeNode: StructuralNode,
    afterNode: StructuralNode
  ): boolean {
    return (
      beforeNode.children.length > 0 &&
      afterNode.children.length > 0 &&
      (beforeNode.name === "") !== (afterNode.name === "")
    );
  }

  private static _findStringCandidates(
    beforeChildren: StructuralChild[],
    beforeMatches: Set<number>,
    afterChild: string
  ): number[] {
    const candidates: number[] = [];
    for (
      let beforeIndex = 0;
      beforeIndex < beforeChildren.length;
      beforeIndex += 1
    ) {
      if (beforeMatches.has(beforeIndex)) continue;
      if (beforeChildren[beforeIndex] === afterChild)
        candidates.push(beforeIndex);
    }
    return candidates;
  }

  private static _findNodeCandidates(
    beforeChildren: StructuralChild[],
    beforeMatches: Set<number>,
    afterNode: StructuralNode,
    comparator: (
      beforeNode: StructuralNode,
      afterNode: StructuralNode
    ) => boolean
  ): number[] {
    const candidates: number[] = [];
    for (
      let beforeIndex = 0;
      beforeIndex < beforeChildren.length;
      beforeIndex += 1
    ) {
      if (beforeMatches.has(beforeIndex)) continue;
      const beforeChild = beforeChildren[beforeIndex];
      if (beforeChild === undefined || typeof beforeChild === "string")
        continue;
      if (comparator(beforeChild, afterNode)) candidates.push(beforeIndex);
    }
    return candidates;
  }

  private static _buildMatchedNode(
    beforeNode: StructuralNode,
    afterNode: StructuralNode,
    reconciledChildren: ReconciledChildren,
    beforeByRef: BeforeStateMap
  ): StructuralNode {
    const reconciledRef = StructuralTree._reconciledRef(
      beforeNode.ref,
      afterNode.ref
    );
    const selfChanged =
      beforeNode.ref !== reconciledRef ||
      !beforeNode.isSelfEqualExceptRef(afterNode);
    const status: StructuralNodeStatus = selfChanged
      ? {
          kind: "updated",
          selfChanged: true,
          childListChanged: reconciledChildren.childListChanged,
        }
      : reconciledChildren.childListChanged
        ? { kind: "updated", selfChanged: false, childListChanged: true }
        : { kind: "unchanged" };
    const reconciled = new StructuralNode({
      ref: reconciledRef,
      status,
      role: afterNode.role,
      name: afterNode.name,
      state: afterNode.state,
      cursorPointer: afterNode.cursorPointer,
      props: { ...afterNode.props },
      children: reconciledChildren.children,
      enrichment: afterNode.enrichment ?? beforeNode.enrichment,
    });
    if (status.kind === "updated") beforeByRef.set(reconciled.ref, beforeNode);
    return reconciled;
  }

  private static _preserveUnchangedSubtree(
    beforeNode: StructuralNode,
    afterNode: StructuralNode
  ): StructuralNode {
    const reconciledChildren = afterNode.children.map((afterChild, index) => {
      const beforeChild = beforeNode.children[index];
      if (beforeChild === undefined) return afterChild;
      if (typeof afterChild === "string" || typeof beforeChild === "string")
        return afterChild;
      return StructuralTree._preserveUnchangedSubtree(beforeChild, afterChild);
    });

    return new StructuralNode({
      ref: StructuralTree._reconciledRef(beforeNode.ref, afterNode.ref),
      status: { kind: "unchanged" },
      role: afterNode.role,
      name: afterNode.name,
      state: afterNode.state,
      cursorPointer: afterNode.cursorPointer,
      props: { ...afterNode.props },
      children: reconciledChildren,
      enrichment: afterNode.enrichment ?? beforeNode.enrichment,
    });
  }

  private static _recordMatchedSubtreeLineage(
    beforeNode: StructuralNode,
    afterNode: StructuralNode,
    beforeByAfterRef: BeforeStateMap
  ): void {
    beforeByAfterRef.set(afterNode.ref, beforeNode);
    if (!StructuralTree._isReconciliationEqual(beforeNode, afterNode)) return;

    for (let index = 0; index < afterNode.children.length; index += 1) {
      const beforeChild = beforeNode.children[index];
      const afterChild = afterNode.children[index];
      if (
        beforeChild === undefined ||
        afterChild === undefined ||
        typeof beforeChild === "string" ||
        typeof afterChild === "string"
      )
        continue;
      StructuralTree._recordMatchedSubtreeLineage(
        beforeChild,
        afterChild,
        beforeByAfterRef
      );
    }
  }

  /** Ref-sensitive recursive equality used only to guard reconciliation shortcuts. */
  private static _isReconciliationEqual(
    beforeNode: StructuralNode,
    afterNode: StructuralNode
  ): boolean {
    const refsEqual =
      StructuralTree._reconciledRef(beforeNode.ref, afterNode.ref) ===
      beforeNode.ref;
    if (
      !refsEqual ||
      !beforeNode.isSelfEqualExceptRef(afterNode) ||
      beforeNode.children.length !== afterNode.children.length
    )
      return false;

    return beforeNode.children.every((beforeChild, index) => {
      const afterChild = afterNode.children[index];
      if (afterChild === undefined) return false;
      if (typeof beforeChild === "string" || typeof afterChild === "string")
        return beforeChild === afterChild;
      return StructuralTree._isReconciliationEqual(beforeChild, afterChild);
    });
  }

  private static _reconciledRef(
    beforeRef: AriaRef,
    afterRef: AriaRef
  ): AriaRef {
    return StructuralTree._isSyntheticRef(beforeRef) &&
      StructuralTree._isSyntheticRef(afterRef)
      ? beforeRef
      : afterRef;
  }

  private static _isSyntheticRef(ref: AriaRef): boolean {
    return ref === "s_root" || ref.startsWith("s_");
  }

  /**
   * Builds an added subtree from an after node, but reconciles in place any
   * descendant whose ref is retained from the before tree: a node that moved into
   * a freshly inserted wrapper keeps its identity and reconciled status instead
   * of being re-minted as part of the addition. Genuinely new nodes are marked
   * `added` with collision-free refs from the allocator.
   */
  private static _buildAddedSubtree(
    afterNode: StructuralNode,
    context: ReconcileContext
  ): StructuralNode {
    const movedBefore = context.beforeNodesByRef.get(afterNode.ref);
    if (
      movedBefore !== undefined &&
      movedBefore.role === afterNode.role &&
      !context.consumedBeforeRefs.has(afterNode.ref)
    ) {
      return StructuralTree._reconcileMovedNode(
        movedBefore,
        afterNode,
        context
      );
    }

    return new StructuralNode({
      ref: context.refAllocator.resolve(afterNode.ref),
      status: { kind: "added" },
      role: afterNode.role,
      name: afterNode.name,
      state: afterNode.state,
      cursorPointer: afterNode.cursorPointer,
      props: { ...afterNode.props },
      children: afterNode.children.map((child) =>
        typeof child === "string"
          ? child
          : StructuralTree._buildAddedSubtree(child, context)
      ),
      enrichment: afterNode.enrichment,
    });
  }

  /**
   * Reconciles a node that kept its ref but moved to a different parent. The ref
   * is preserved and content is reconciled against the before node, so a
   * pure relocation stays `unchanged` and a relocation with edits becomes
   * `updated` — no movement-specific status is introduced.
   */
  private static _reconcileMovedNode(
    beforeNode: StructuralNode,
    afterNode: StructuralNode,
    context: ReconcileContext
  ): StructuralNode {
    context.consumedBeforeRefs.add(afterNode.ref);
    StructuralTree._recordMatchedSubtreeLineage(
      beforeNode,
      afterNode,
      context.beforeByAfterRef
    );
    if (StructuralTree._isReconciliationEqual(beforeNode, afterNode))
      return StructuralTree._preserveUnchangedSubtree(beforeNode, afterNode);

    const reconciledChildren = StructuralTree._reconcileChildren(
      [...beforeNode.children],
      [...afterNode.children],
      context
    );
    return StructuralTree._buildMatchedNode(
      beforeNode,
      afterNode,
      reconciledChildren,
      context.beforeByRef
    );
  }

  /**
   * Marks a before subtree as `removed`, preserving refs, but drops any descendant
   * whose ref is retained in the after tree: that descendant moved out and is
   * emitted once at its after location, so keeping it here would duplicate it.
   */
  private static _buildRemovedSubtree(
    beforeNode: StructuralNode,
    context: ReconcileContext
  ): StructuralNode {
    const children: StructuralChild[] = [];
    for (const child of beforeNode.children) {
      if (typeof child === "string") {
        children.push(child);
        continue;
      }
      const afterNode = context.afterNodesByRef.get(child.ref);
      if (afterNode?.role === child.role) continue;
      children.push(StructuralTree._buildRemovedSubtree(child, context));
    }

    return new StructuralNode({
      ref: beforeNode.ref,
      status: { kind: "removed" },
      role: beforeNode.role,
      name: beforeNode.name,
      state: beforeNode.state,
      cursorPointer: beforeNode.cursorPointer,
      props: { ...beforeNode.props },
      children,
      enrichment: beforeNode.enrichment,
    });
  }

  private static _materializeFrame(frame: MutableNodeFrame): StructuralChild[] {
    const children = frame.children.flatMap((child) =>
      typeof child === "string"
        ? [child]
        : StructuralTree._materializeFrame(child)
    );
    if (frame.ref === undefined) return children;

    return [
      new StructuralNode({
        ref: frame.ref,
        role: frame.role,
        name: frame.name,
        state: frame.state,
        cursorPointer: frame.cursorPointer,
        props: frame.props,
        children,
      }),
    ];
  }

  private static _createNodeFrame(
    parsedNode: ParsedNodeLine,
    refFactory: SyntheticAriaRefAllocator,
    synthesizeRefLess: boolean
  ): MutableNodeFrame {
    return {
      ref:
        parsedNode.attributes.ref === undefined
          ? synthesizeRefLess
            ? refFactory.create()
            : undefined
          : AriaRefSchema.parse(parsedNode.attributes.ref),
      role: parsedNode.role,
      name: parsedNode.name,
      state: {
        checked: parsedNode.attributes.checked,
        disabled: parsedNode.attributes.disabled,
        expanded: parsedNode.attributes.expanded,
        active: parsedNode.attributes.active,
        selected: parsedNode.attributes.selected,
        pressed: parsedNode.attributes.pressed,
        level: parsedNode.attributes.level,
      },
      cursorPointer: !!parsedNode.attributes.cursorPointer,
      props: {},
      children: [],
    };
  }

  private static _parsePropertyLine(trimmedLine: string): {
    name: string;
    value: string;
  } {
    const match = /^- \/([^:]+):(?:\s(.*))?$/.exec(trimmedLine);
    if (!match) throw new Error(`Invalid property line: ${trimmedLine}`);
    return {
      name: match[1]!,
      value: StructuralTree._parseScalar(match[2] ?? ""),
    };
  }

  private static _parseTextLine(trimmedLine: string): string {
    const match = /^- text:(?:\s(.*))?$/.exec(trimmedLine);
    if (!match) throw new Error(`Invalid text line: ${trimmedLine}`);
    return StructuralTree._parseScalar(match[1] ?? "");
  }

  private static _parseNodeLine(trimmedLine: string): ParsedNodeLine {
    const match =
      /^- ([^"[\]:]+?)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]+\])*)(?::(?:\s(.*))?)?$/.exec(
        trimmedLine
      );
    if (!match) throw new Error(`Invalid aria node line: ${trimmedLine}`);
    const [, rawRole, rawName, rawAttributes, inlineText] = match;
    return {
      role: parseStructuralRole(rawRole!.trim()),
      name: rawName ? StructuralTree._unescapeQuoted(rawName) : "",
      attributes: StructuralTree._parseAttributes(rawAttributes ?? ""),
      inlineText:
        inlineText === undefined
          ? undefined
          : StructuralTree._parseScalar(inlineText),
    };
  }

  private static _parseAttributes(rawAttributes: string): ParsedAttributeMap {
    const attributes: ParsedAttributeMap = {};
    const matches = rawAttributes.match(/\[[^\]]+\]/g) ?? [];
    for (const match of matches) {
      const content = match.slice(1, -1);
      if (content === "active") attributes.active = true;
      else if (content === "disabled") attributes.disabled = true;
      else if (content === "expanded") attributes.expanded = true;
      else if (content === "selected") attributes.selected = true;
      else if (content === "checked") attributes.checked = true;
      else if (content === "pressed") attributes.pressed = true;
      else if (content === "cursor=pointer") attributes.cursorPointer = true;
      else if (content.startsWith("ref=")) attributes.ref = content.slice(4);
      else if (content.startsWith("level="))
        attributes.level = Number(content.slice(6));
      else if (content.startsWith("checked="))
        attributes.checked = StructuralTree._parseTriState(content.slice(8));
      else if (content.startsWith("pressed="))
        attributes.pressed = StructuralTree._parseTriState(content.slice(8));
    }
    return attributes;
  }

  private static _parseTriState(value: string): boolean | "mixed" {
    if (value === "mixed") return "mixed";
    return value === "true";
  }

  private static _parseScalar(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.startsWith('"') &&
      trimmed.endsWith('"')
    ) {
      return StructuralTree._unescapeQuoted(trimmed.slice(1, -1));
    }
    return trimmed;
  }

  private static _unescapeQuoted(value: string): string {
    return value.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
  }
}
