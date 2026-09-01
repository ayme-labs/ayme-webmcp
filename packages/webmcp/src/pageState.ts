import { captureAriaSnapshot } from "@ayme-dev/playwright-browser";
import {
  AriaRefSchema,
  parseStructuralRole,
  renderCompactStructuralNodeForest,
  StructuralNode,
  StructuralTree,
  SyntheticAriaRefFactory,
  type AriaRef,
  type StructuralNodeProperty,
} from "@ayme-dev/structural-observation";
import type { ModelContextTool } from "@mcp-b/webmcp-types";
import { listRegisteredPomRoots } from "./registry";

const inputSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const getPageStateTool = {
  name: "get_page_state",
  description:
    "Return the current page as Playwright's AI ARIA snapshot with structural refs.",
  inputSchema,
  execute: async () => capturePageState(),
} satisfies ModelContextTool<Record<string, never>, string>;

async function capturePageState() {
  const capture = captureAriaSnapshot(document.body);
  const refFactory = new SyntheticAriaRefFactory();
  let tree = StructuralTree.fromAriaSnapshotYaml(
    capture.distilledText,
    refFactory
  );
  const fullTree = StructuralTree.fromAriaSnapshotYaml(
    capture.fullText,
    refFactory
  );
  const properties = new Map<AriaRef, StructuralNodeProperty[]>();

  for (const root of await listRegisteredPomRoots()) {
    if (root.element.ownerDocument !== document || !isVisible(root.element))
      continue;
    const rawRef = capture.refsByElement.get(root.element);
    const ref = rawRef ? AriaRefSchema.parse(rawRef) : refFactory.create();
    if (rawRef) {
      tree = appendCapturedRoot(
        tree,
        fullTree,
        ref,
        root.element,
        capture.refsByElement
      );
    } else {
      const parentRef = capturedParentRef(
        tree,
        root.element,
        capture.refsByElement
      );
      if (!parentRef) continue;
      tree = tree.appendChild(
        parentRef,
        new StructuralNode({
          ref,
          role: syntheticRole(root.element),
          name: syntheticName(root.element),
          cursorPointer: false,
        })
      );
    }
    if (!tree.hasNode(ref)) continue;
    const labels = properties.get(ref) ?? [];
    labels.push({ name: "pom", value: root.label });
    properties.set(ref, labels);
  }

  return renderCompactStructuralNodeForest(
    {
      roots: tree.getRootNodes(),
      structuralNode: (node) => node,
      children: (node) => node.children,
    },
    { properties }
  );
}

function appendCapturedRoot(
  tree: StructuralTree,
  fullTree: StructuralTree,
  ref: AriaRef,
  element: Element,
  refsByElement: ReadonlyMap<Element, string>
) {
  if (tree.hasNode(ref)) return tree;
  const node = fullTree.getNode(ref);
  const parentRef = capturedParentRef(tree, element, refsByElement);
  return node && parentRef ? tree.appendChild(parentRef, node) : tree;
}

function capturedParentRef(
  tree: StructuralTree,
  element: Element,
  refsByElement: ReadonlyMap<Element, string>
) {
  let parent = element.parentElement;
  while (parent) {
    const rawRef = refsByElement.get(parent);
    if (rawRef) {
      const ref = AriaRefSchema.parse(rawRef);
      if (tree.hasNode(ref)) return ref;
    }
    parent = parent.parentElement;
  }
  return undefined;
}

function syntheticRole(element: Element) {
  try {
    return parseStructuralRole(element.getAttribute("role") ?? "generic");
  } catch {
    return parseStructuralRole("generic");
  }
}

function syntheticName(element: Element) {
  return (element.getAttribute("aria-label") ?? element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisible(element: Element) {
  if (!element.isConnected) return false;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.getAttribute("aria-hidden") === "true") return false;
    if (current instanceof HTMLElement && current.hidden) return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden")
      return false;
  }
  return true;
}
