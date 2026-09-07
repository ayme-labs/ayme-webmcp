import type {
  PomComponentManifest,
  PomDefinition,
  PomDefinitionAction,
  PomDefinitionLookupResult,
  PomDefinitionsResult,
  PomManifest,
} from "./contracts";
import { listRegisteredPoms } from "./registry";

type DefinitionNode = {
  name: string;
  description?: string;
  members: PomManifest["members"];
  tools: PomManifest["tools"];
};

export function getPomDefinitions(): PomDefinitionsResult {
  const index = definitionIndex();
  return {
    definitions: [...index.entries()].flatMap(([, candidates]) => {
      const distinct = distinctDefinitions(candidates);
      return distinct.length === 1 ? distinct : [];
    }),
  };
}

export function getPomDefinition(name: string): PomDefinitionLookupResult {
  const candidates = distinctDefinitions(definitionIndex().get(name) ?? []);
  if (candidates.length === 0) return { status: "unknown", name };
  if (candidates.length > 1) return { status: "ambiguous", name };
  return { status: "found", definition: candidates[0] };
}

function definitionIndex() {
  const definitions = new Map<string, PomDefinition[]>();
  for (const registration of listRegisteredPoms()) {
    for (const definition of reachableDefinitions(registration.manifest)) {
      const candidates = definitions.get(definition.name) ?? [];
      candidates.push(definition);
      definitions.set(definition.name, candidates);
    }
  }
  return definitions;
}

function reachableDefinitions(manifest: PomManifest) {
  const nodes = nodesFor(manifest);
  const reachable: PomDefinition[] = [];
  const visited = new Set<string>();
  const pending = [manifest.className];

  while (pending.length > 0) {
    const name = pending.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);
    for (const node of nodes.get(name) ?? []) {
      const definition = definitionFor(node);
      reachable.push(definition);
      pending.push(
        ...definition.children,
        ...definition.actions.flatMap((action) => action.returnPoms)
      );
    }
  }
  return reachable;
}

function nodesFor(manifest: PomManifest) {
  const nodes = new Map<string, DefinitionNode[]>();
  addNode(nodes, manifest);
  for (const component of manifest.components) addNode(nodes, component);
  return nodes;
}

function addNode(
  nodes: Map<string, DefinitionNode[]>,
  node: PomManifest | PomComponentManifest
) {
  const candidates = nodes.get(node.className) ?? [];
  candidates.push({
    name: node.className,
    ...(node.description === undefined
      ? {}
      : { description: node.description }),
    members: node.members,
    tools: node.tools,
  });
  nodes.set(node.className, candidates);
}

function definitionFor(node: DefinitionNode): PomDefinition {
  const children = [
    ...new Set(
      node.members.flatMap((member) =>
        member.kind === "component" ? [member.componentClassName] : []
      )
    ),
  ];
  const actions: PomDefinitionAction[] = node.tools.map((tool) => ({
    name: tool.methodName,
    description: tool.description,
    inputSchema: tool.inputSchema,
    returnPoms: tool.returnPoms ?? [],
  }));
  return {
    name: node.name,
    ...(node.description === undefined
      ? {}
      : { description: node.description }),
    children,
    actions,
  };
}

function distinctDefinitions(definitions: readonly PomDefinition[]) {
  const unique = new Map<string, PomDefinition>();
  for (const definition of definitions) {
    unique.set(JSON.stringify(definition), definition);
  }
  return [...unique.values()];
}
