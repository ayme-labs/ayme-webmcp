import { captureAriaSnapshot } from "@ayme-dev/playwright-browser";
import {
  AriaRefSchema,
  renderCompactStructuralNodeForest,
  StructuralProjection,
  StructuralTree,
  SyntheticAriaRefFactory,
  type AriaRef,
  type OmittedCapturedRoot,
  type ReferencedCapturedRoot,
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
    "Return the top-level structural page state, decorated with root POM labels. Real nodes use Playwright refs; synthetic POM roots use observation-only synthetic refs. Capture is limited to the top-level document.",
  inputSchema,
  execute: async () => capturePageState(),
} satisfies ModelContextTool<Record<string, never>, string>;

export async function capturePageState(root: Element = document.body) {
  const registrations = (await listRegisteredPomRoots()).filter(
    (registration) =>
      registration.element.ownerDocument === root.ownerDocument &&
      root.contains(registration.element)
  );
  const capture = captureAriaSnapshot(root);
  const refFactory = new SyntheticAriaRefFactory();
  const retainedTree = StructuralTree.fromPlaywrightAriaSnapshotYaml(
    capture.distilledText,
    refFactory
  );
  const fullTree = StructuralTree.fromPlaywrightAriaSnapshotYaml(
    capture.fullText,
    refFactory
  );

  const coalesced = coalesceByElement(registrations);
  const referenced: {
    candidate: ReferencedCapturedRoot;
    labels: string[];
  }[] = [];
  const omitted: { element: Element; labels: string[] }[] = [];

  for (const entry of coalesced) {
    const rawRef = capture.refsByElement.get(entry.element);
    if (rawRef !== undefined) {
      referenced.push({
        candidate: {
          kind: "referenced",
          ref: AriaRefSchema.parse(rawRef),
        },
        labels: entry.labels,
      });
    } else {
      omitted.push(entry);
    }
  }

  sortOuterToInner(omitted);

  const refPlacement = retainedTree.placeCapturedRoots(
    fullTree,
    referenced.map((r) => r.candidate)
  );
  let currentTree = refPlacement.tree;
  const labelsByRef = new Map<AriaRef, string[]>();

  for (const [index, ref] of refPlacement.refs.entries()) {
    if (ref === null) continue;
    labelsByRef.set(ref, referenced[index]!.labels);
  }

  for (const entry of omitted) {
    const candidate = omittedCapturedRoot(
      entry.element,
      capture.refsByElement,
      currentTree,
      fullTree
    );
    const placement = currentTree.placeCapturedRoots(fullTree, [candidate]);
    currentTree = placement.tree;
    const ref = placement.refs[0] ?? null;
    if (ref !== null) {
      labelsByRef.set(ref, entry.labels);
    }
  }

  const properties = new Map<AriaRef, StructuralNodeProperty[]>();
  for (const [ref, labels] of labelsByRef) {
    const sorted = [...labels].sort();
    const value: string | readonly string[] =
      sorted.length === 1 ? sorted[0]! : sorted;
    properties.set(ref, [{ name: "pom", value }]);
  }

  const projected = new StructuralProjection().project(currentTree, properties);
  return renderCompactStructuralNodeForest({
    roots: projected,
    structuralNode: (node) => node.node,
    children: (node) => node.children,
    properties: (node) => node.properties,
  });
}

function coalesceByElement(
  roots: readonly { label: string; element: Element }[]
): { element: Element; labels: string[] }[] {
  const seen = new Map<Element, { element: Element; labels: string[] }>();
  for (const root of roots) {
    const existing = seen.get(root.element);
    if (existing) {
      if (!existing.labels.includes(root.label))
        existing.labels.push(root.label);
    } else {
      seen.set(root.element, { element: root.element, labels: [root.label] });
    }
  }
  return [...seen.values()];
}

function sortOuterToInner(
  entries: { element: Element; labels: string[] }[]
): void {
  const decorated = entries.map((entry, index) => ({
    entry,
    index,
    depth: entries.filter(
      (other) => other !== entry && other.element.contains(entry.element)
    ).length,
  }));
  decorated.sort((a, b) => a.depth - b.depth || a.index - b.index);
  const sorted = decorated.map((d) => d.entry);
  for (let i = 0; i < entries.length; i++) entries[i] = sorted[i]!;
}

function omittedCapturedRoot(
  element: Element,
  refsByElement: ReadonlyMap<Element, string>,
  currentTree: StructuralTree,
  fullTree: StructuralTree
): OmittedCapturedRoot {
  const fullOrder = new Map(
    fullTree.getAllRefs().map((ref, index) => [ref, index] as const)
  );
  const descendantRefs = [...refsByElement]
    .filter(
      ([candidate]) => candidate !== element && element.contains(candidate)
    )
    .map(([, ref]) => AriaRefSchema.parse(ref))
    .filter((ref) => currentTree.hasNode(ref))
    .sort(
      (left, right) =>
        (fullOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (fullOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    );
  const ancestorRef = descendantRefs[0]
    ? currentTree
        .getAncestorsOf(descendantRefs[0])
        .find((ancestor) =>
          descendantRefs.every((ref) =>
            currentTree
              .getAncestorsOf(ref)
              .some((candidate) => candidate.ref === ancestor.ref)
          )
        )?.ref
    : undefined;

  return {
    kind: "omitted",
    ancestorRef,
    descendantRefs,
    role: "generic",
    name: "",
  };
}
