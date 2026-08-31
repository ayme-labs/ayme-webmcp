import {
  AriaRefSchema,
  type AriaRef,
  type PlaywrightLocatorString,
} from "./StructuralTypes";
import type { AriaNode, AriaRole } from "./StructuralTypes";

function ariaNodesEqual(left: AriaNode, right: AriaNode): boolean {
  if (left.role !== right.role || left.name !== right.name) return false;
  if (
    left.active !== right.active ||
    left.checked !== right.checked ||
    left.disabled !== right.disabled ||
    left.expanded !== right.expanded ||
    left.invalid !== right.invalid ||
    left.level !== right.level ||
    left.pressed !== right.pressed ||
    left.selected !== right.selected ||
    (left.box.cursor === "pointer") !== (right.box.cursor === "pointer")
  )
    return false;

  const leftKeys = Object.keys(left.props);
  const rightKeys = Object.keys(right.props);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left.props[key] === right.props[key])
  );
}

export type StructuralNodeStatus =
  | { readonly kind: "unchanged" }
  | { readonly kind: "added" }
  | { readonly kind: "removed" }
  | {
      readonly kind: "updated";
      readonly selfChanged: true;
      readonly childListChanged: boolean;
    }
  | {
      readonly kind: "updated";
      readonly selfChanged: false;
      readonly childListChanged: true;
    };

export type StructuralNodeStatusKind = StructuralNodeStatus["kind"];

/**
 * The subset of reconciliation statuses that represent a node entering or
 * leaving the tree, i.e. the only statuses that carry visibility meaning.
 */
export type VisibilityChangeStatus = Extract<
  StructuralNodeStatus,
  { kind: "added" | "removed" }
>["kind"];
export type StructuralRole = AriaRole | "fragment" | "iframe";

const STRUCTURAL_ROLES: readonly StructuralRole[] = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "fragment",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "iframe",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "mark",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
];

export function isStructuralRole(value: string): value is StructuralRole {
  return STRUCTURAL_ROLES.some((role) => role === value);
}

export function parseStructuralRole(value: string) {
  if (!isStructuralRole(value)) throw new Error(`Unknown aria role: ${value}`);
  return value;
}

export type StructuralChild = StructuralNode | string;

/**
 * Caller-derived data attached to a structural node. Enrichment deliberately
 * stays out of identity matching, so attaching it never changes reconciliation.
 * Timeline rendering may opt in to emitting it (as `/html` and `/locators`
 * property lines) for nodes that still need a semantic identity.
 */
export type StructuralNodeEnrichment = {
  locators: readonly PlaywrightLocatorString[];
  strippedHtml: string;
};

export type StructuralNodeState = {
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  active?: boolean;
  selected?: boolean;
  pressed?: boolean | "mixed";
  level?: number;
};

type StructuralNodeConstructorData = {
  ref: AriaRef;
  status?: StructuralNodeStatus;
  role: StructuralRole;
  name: string;
  state?: StructuralNodeState;
  cursorPointer: boolean;
  props?: Record<string, string>;
  children?: StructuralChild[];
  enrichment?: StructuralNodeEnrichment | null;
};

export class StructuralNode {
  readonly ref: AriaRef;
  readonly status?: StructuralNodeStatus;
  readonly role: StructuralRole;
  readonly name: string;
  readonly state: Readonly<StructuralNodeState>;
  readonly cursorPointer: boolean;
  readonly props: Readonly<Record<string, string>>;
  readonly children: readonly StructuralChild[];
  readonly enrichment: StructuralNodeEnrichment | null;

  private readonly _ariaNode: AriaNode;

  constructor(data: StructuralNodeConstructorData) {
    this.ref = AriaRefSchema.parse(data.ref);
    this.status =
      data.status === undefined ? undefined : Object.freeze({ ...data.status });
    this.role = data.role;
    this.name = data.name;
    this.state = Object.freeze({ ...(data.state ?? {}) });
    this.cursorPointer = data.cursorPointer;
    this.props = Object.freeze({ ...(data.props ?? {}) });
    this.children = Object.freeze([...(data.children ?? [])]);
    this.enrichment = data.enrichment
      ? Object.freeze({
          ...data.enrichment,
          locators: Object.freeze([...data.enrichment.locators]),
        })
      : null;
    this._ariaNode = StructuralNode._toAriaNode(this);
  }

  /**
   * Creates a structural node from ARIA-shaped evidence with an allocated structural ref. Selector
   * resolution may supply a synthetic DOM-derived description rather than a Playwright ARIA-tree node.
   */
  static fromAriaNode(
    ariaNode: AriaNode,
    syntheticRef: AriaRef,
    enrichment?: StructuralNodeEnrichment
  ): StructuralNode {
    return new StructuralNode({
      ref:
        ariaNode.ref === undefined
          ? syntheticRef
          : AriaRefSchema.parse(ariaNode.ref),
      role: ariaNode.role,
      name: ariaNode.name,
      state: {
        checked: ariaNode.checked,
        disabled: ariaNode.disabled,
        expanded: ariaNode.expanded,
        active: ariaNode.active,
        selected: ariaNode.selected,
        pressed: ariaNode.pressed,
        level: ariaNode.level,
      },
      cursorPointer: ariaNode.box.cursor === "pointer",
      props: ariaNode.props,
      children: [],
      enrichment,
    });
  }

  /**
   * Returns a copy of this node with the given enrichment attached. All other
   * node data (id, status, role, name, state, props, children, ...) is preserved
   * and the original node is left untouched.
   */
  enrich(enrichment: StructuralNodeEnrichment): StructuralNode {
    return new StructuralNode({
      ref: this.ref,
      status: this.status,
      role: this.role,
      name: this.name,
      state: this.state,
      cursorPointer: this.cursorPointer,
      props: { ...this.props },
      children: [...this.children],
      enrichment,
    });
  }

  /**
   * Structural identity used to match nodes across snapshots. Identity is
   * `role + name`, falling back to `role + direct text` for unnamed text-carrying
   * leaves. It intentionally ignores state flags, props, cursorPointer, ref,
   * and children so that transient control changes (e.g. a button becoming
   * disabled) keep the same identity and reconcile as `updated` rather than
   * `added` + `removed`.
   */
  isShallowEqual(other: StructuralNode): boolean {
    return this._identityKey() === other._identityKey();
  }

  isDeepEqual(other: StructuralNode): boolean {
    if (!this._attributesEqual(other)) return false;
    return this._childrenEqual(other);
  }

  /**
   * Compares data that belongs to this node itself, not its structural-child
   * list. Direct text is node content; nested structural nodes are not.
   */
  isSelfEqual(other: StructuralNode): boolean {
    return (
      this.ref === other.ref &&
      this._attributesEqual(other) &&
      StructuralNode._directText(this) === StructuralNode._directText(other)
    );
  }

  isSelfEqualExceptRef(other: StructuralNode): boolean {
    return (
      this._attributesEqual(other) &&
      StructuralNode._directText(this) === StructuralNode._directText(other)
    );
  }

  hasChangedDescendant(): boolean {
    return this.children.some(
      (child) =>
        typeof child !== "string" &&
        ((child.status !== undefined && child.status.kind !== "unchanged") ||
          child.hasChangedDescendant())
    );
  }

  /**
   * Compares every structural attribute and child while deliberately ignoring
   * this node's accessible name. Used only for the conservative case where a
   * rerendered container gains or loses a name but its subtree is otherwise
   * unchanged.
   */
  isDeepEqualExceptName(other: StructuralNode): boolean {
    const thisAriaNode = { ...this._ariaNode, name: "" };
    const otherAriaNode = { ...other._ariaNode, name: "" };
    if (!ariaNodesEqual(thisAriaNode, otherAriaNode)) return false;
    return this._childrenEqual(other);
  }

  private _childrenEqual(other: StructuralNode): boolean {
    if (this.children.length !== other.children.length) return false;

    for (let index = 0; index < this.children.length; index += 1) {
      const left = this.children[index];
      const right = other.children[index];
      if (left === undefined || right === undefined) return false;
      if (typeof left === "string" || typeof right === "string") {
        if (left !== right) return false;
        continue;
      }
      if (!left.isDeepEqual(right)) return false;
    }

    return true;
  }

  walk(visitor: (node: StructuralNode) => void): void {
    visitor(this);
    for (const child of this.children) {
      if (typeof child !== "string") child.walk(visitor);
    }
  }

  private _identityKey(): string {
    const label = this.name !== "" ? this.name : this._fallbackTextLabel();
    return `${this.role}\u0000${label}`;
  }

  /**
   * Direct-text identity only applies to unnamed text-only leaves. Unnamed
   * containers (those with any child node) fall back to role-only identity so a
   * benign text change inside a region does not change the region's identity.
   */
  private _fallbackTextLabel(): string {
    const hasChildNode = this.children.some(
      (child) => typeof child !== "string"
    );
    if (hasChildNode) return "";
    return StructuralNode._directText(this);
  }

  private _attributesEqual(other: StructuralNode): boolean {
    return ariaNodesEqual(this._ariaNode, other._ariaNode);
  }

  private static _directText(node: StructuralNode): string {
    const hasText = node.children.some((child) => typeof child === "string");
    if (!hasText) return "";
    return node.children
      .map((child) => (typeof child === "string" ? child : "\0"))
      .join("");
  }

  private static _toAriaNode(node: StructuralNode): AriaNode {
    // `box.visible` is not encoded in the aria snapshot YAML this spike parses,
    // so it is not modeled on StructuralNode. ariaNodesEqual ignores box.visible,
    // so the value here is structurally irrelevant to equality.
    const box = node.cursorPointer
      ? { visible: true, inline: false, cursor: "pointer" as const }
      : { visible: true, inline: false };

    return {
      role: node.role,
      name: node.name,
      ref: node.ref,
      children: [],
      box,
      receivesPointerEvents: node.cursorPointer,
      props: { ...node.props },
      checked: node.state.checked,
      disabled: node.state.disabled,
      expanded: node.state.expanded,
      active: node.state.active,
      selected: node.state.selected,
      pressed: node.state.pressed,
      level: node.state.level,
    };
  }
}
