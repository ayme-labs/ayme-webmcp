import type { AriaRef } from "./StructuralTypes";
import type {
  StructuralNode,
  StructuralNodeStatusKind,
} from "./StructuralNode";
import type { StructuralNodeProperty } from "./StructuralProjection";

export type StructuralIdentity = {
  semanticNodeId: string;
  name: string;
  description: string;
};

type CompactStructuralTreeRenderOptions = {
  identity?: ReadonlyMap<AriaRef, StructuralIdentity>;
  enrichNodeRefs?: ReadonlySet<AriaRef>;
};

type CompactStructuralTreeRenderState = {
  incremental: boolean;
  triggerRef?: AriaRef;
  includeIdentityDetails?: boolean;
};

type RenderNode = (depth: number) => string;

export type StructuralNodeForestSource<TNode> = {
  roots: ReadonlyArray<TNode | string>;
  children(node: TNode): ReadonlyArray<TNode | string>;
  structuralNode(node: TNode): StructuralNode;
  properties?(node: TNode): readonly StructuralNodeProperty[];
  compact?(node: TNode): boolean;
};

const STATUS_TOKEN: Partial<Record<StructuralNodeStatusKind, string>> = {
  updated: "<changed>",
  added: "<added>",
  removed: "<removed>",
};

export function renderCompactStructuralNodeForest<TNode>(
  source: StructuralNodeForestSource<TNode>,
  options: CompactStructuralTreeRenderOptions = {},
  renderState: CompactStructuralTreeRenderState | undefined = undefined
): string {
  const subtreeHasPropertiesCache = new Map<TNode, boolean>();
  const subtreeHasProperties = (entry: TNode): boolean => {
    const cached = subtreeHasPropertiesCache.get(entry);
    if (cached !== undefined) return cached;

    const hasProperties = (source.properties?.(entry).length ?? 0) > 0;
    const result =
      hasProperties ||
      source
        .children(entry)
        .some(
          (child) => typeof child !== "string" && subtreeHasProperties(child)
        );
    subtreeHasPropertiesCache.set(entry, result);
    return result;
  };

  const effectiveChildren = (
    entry: TNode | string
  ): ReadonlyArray<TNode | string> => {
    if (typeof entry === "string") return [];
    if (!source.compact?.(entry)) return source.children(entry);
    return source
      .children(entry)
      .filter(
        (child): child is TNode =>
          typeof child !== "string" && subtreeHasProperties(child)
      );
  };

  const rendered = mapTree<TNode | string, RenderNode>(source.roots, {
    children: effectiveChildren,
    renderNode: (entry, children) => {
      if (typeof entry === "string")
        return (depth) => `${indent(depth)}- text: ${formatScalar(entry)}`;
      const node = source.structuralNode(entry);
      return (depth) =>
        renderStructuralNode(
          node,
          effectiveChildren(entry),
          children,
          depth,
          options,
          renderState,
          source.properties?.(entry) ?? [],
          source.compact?.(entry)
        );
    },
  });
  return rendered.map((render) => render(0)).join("\n");
}

function renderStructuralNode<TNode>(
  node: StructuralNode,
  effectiveChildren: ReadonlyArray<TNode | string>,
  children: ReadonlyArray<RenderNode>,
  depth: number,
  options: CompactStructuralTreeRenderOptions,
  renderState: CompactStructuralTreeRenderState | undefined,
  properties: readonly StructuralNodeProperty[],
  compact = false
): string {
  const statusToken =
    renderState?.incremental && node.status
      ? STATUS_TOKEN[node.status.kind]
      : undefined;
  const isTrigger =
    renderState?.incremental && renderState.triggerRef === node.ref;
  const prefixes = [isTrigger ? "<trigger>" : undefined, statusToken].filter(
    (value): value is string => value !== undefined
  );
  const propertyLines = extraPropertyLines(
    node,
    depth,
    properties,
    options,
    renderState
  );

  if (
    renderState?.incremental &&
    compact &&
    effectiveChildren.length === 0 &&
    propertyLines.length === 0 &&
    inlinePomLabel(properties) === undefined
  ) {
    const statusPrefix = statusToken === undefined ? "" : `${statusToken} `;
    return `${indent(depth)}- ${statusPrefix}${nodeIdentity(node, options)}`;
  }

  const header = [
    ...prefixes,
    formatNodeHeader(node, options, properties),
  ].join(" ");
  const inlineText = effectiveChildren.filter(
    (child): child is string => typeof child === "string"
  );
  const hasNodeChildren = effectiveChildren.some(
    (child) => typeof child !== "string"
  );
  const hasProperties = Object.keys(node.props).length > 0;
  const block =
    hasProperties ||
    hasNodeChildren ||
    inlineText.length > 1 ||
    propertyLines.length > 0;

  if (!block && inlineText.length === 1)
    return `${indent(depth)}- ${header}: ${formatScalar(inlineText[0])}`;

  const lines = [`${indent(depth)}- ${header}${block ? ":" : ""}`];
  for (const [name, value] of Object.entries(node.props))
    lines.push(`${indent(depth + 1)}- /${name}: ${formatScalar(value)}`);
  lines.push(...propertyLines);
  for (const child of children) lines.push(child(depth + 1));
  return lines.join("\n");
}

function formatNodeHeader(
  node: StructuralNode,
  options: CompactStructuralTreeRenderOptions,
  properties: readonly StructuralNodeProperty[]
): string {
  const segments: string[] = [nodeIdentity(node, options)];
  const pom = inlinePomLabel(properties);
  if (pom !== undefined) segments.push(pom);
  else if (!node.ref.startsWith("s_") && node.role !== "generic")
    segments.push(node.role);
  if (node.name) segments.push(`"${escapeQuoted(node.name)}"`);
  const state = node.state;
  if (state.checked === true) segments.push("[checked]");
  if (state.checked === "mixed") segments.push("[checked=mixed]");
  if (state.disabled) segments.push("[disabled]");
  if (state.expanded) segments.push("[expanded]");
  if (state.active) segments.push("[active]");
  if (state.selected) segments.push("[selected]");
  if (state.pressed === true) segments.push("[pressed]");
  if (state.pressed === "mixed") segments.push("[pressed=mixed]");
  if (state.level !== undefined) segments.push(`[level=${state.level}]`);
  if (node.cursorPointer) segments.push("[cursor=pointer]");
  return segments.join(" ");
}

function nodeIdentity(
  node: StructuralNode,
  options: CompactStructuralTreeRenderOptions
): string {
  return options.identity?.has(node.ref)
    ? `[${identityToken(node, options)}]`
    : node.ref;
}

function identityToken(
  node: StructuralNode,
  options: CompactStructuralTreeRenderOptions
): string {
  const identity = options.identity?.get(node.ref);
  return identity ? `id=${identity.semanticNodeId}` : `ref=${node.ref}`;
}

function inlinePomLabel(
  properties: readonly StructuralNodeProperty[]
): string | undefined {
  const pom = properties.find((property) => property.name === "pom");
  if (pom === undefined || typeof pom.value !== "string") return undefined;
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(pom.value)
    ? pom.value
    : undefined;
}

function extraPropertyLines(
  node: StructuralNode,
  depth: number,
  properties: readonly StructuralNodeProperty[],
  options: CompactStructuralTreeRenderOptions,
  renderState: CompactStructuralTreeRenderState | undefined
): string[] {
  const pom = inlinePomLabel(properties);
  const lines = properties.map((property) => {
    if (property.name === "pom" && pom !== undefined) return undefined;
    return `${indent(depth + 1)}- /${property.name}: ${formatPropertyValue(
      property.value
    )}`;
  });
  const retainedLines = lines.filter(
    (line): line is string => line !== undefined
  );
  const identity = options.identity?.get(node.ref);
  if (identity && renderState?.includeIdentityDetails) {
    retainedLines.push(
      `${indent(depth + 1)}- /name: ${formatScalar(identity.name)}`
    );
    retainedLines.push(
      `${indent(depth + 1)}- /description: ${formatScalar(identity.description)}`
    );
    return retainedLines;
  }

  const shouldEnrich =
    !identity && options.enrichNodeRefs?.has(node.ref) === true;
  if (!shouldEnrich || node.enrichment === null) return retainedLines;

  if (node.enrichment.strippedHtml !== "")
    retainedLines.push(
      `${indent(depth + 1)}- /html: ${formatScalar(
        node.enrichment.strippedHtml
      )}`
    );
  if (node.enrichment.locators.length > 0)
    retainedLines.push(
      `${indent(depth + 1)}- /locators: ${JSON.stringify(
        node.enrichment.locators
      )}`
    );
  return retainedLines;
}

function mapTree<TNode, TOutput>(
  roots: ReadonlyArray<TNode>,
  projection: {
    children(node: TNode): ReadonlyArray<TNode>;
    renderNode(node: TNode, children: ReadonlyArray<TOutput>): TOutput;
  }
): TOutput[] {
  const mapNode = (node: TNode): TOutput =>
    projection.renderNode(node, projection.children(node).map(mapNode));

  return roots.map(mapNode);
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function formatScalar(value: string): string {
  if (value === "") return '""';
  if (/[:#[\]{},"'&*!?|<>%@`]/.test(value) || /^\s|\s$/.test(value))
    return `"${escapeQuoted(value)}"`;
  return value;
}

function formatPropertyValue(value: string | readonly string[]): string {
  return typeof value === "string"
    ? formatScalar(value)
    : (JSON.stringify(value) ?? "[]");
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
