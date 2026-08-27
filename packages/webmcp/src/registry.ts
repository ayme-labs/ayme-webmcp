import type {
  JsonPrimitive,
  JsonSchema,
  JsonValue,
  PomComponentManifest,
  PomComponentMemberManifest,
  PomManifest,
  PomMemberManifest,
  PomMemberObservation,
  RegisteredTool,
  ToolManifest,
} from "./contracts";
import type { BrowserLocator, BrowserPage } from "./browserPage";

type CompiledPom = {
  manifest: PomManifest;
  instantiate(page: BrowserPage): object;
};

export type RegisteredPom = {
  id: string;
  instance: object;
  manifest: PomManifest;
  memberObservations: readonly PomMemberObservation[];
  tools: readonly RegisteredTool[];
};

let browserPage: BrowserPage | undefined;
const compiledPoms = new WeakMap<object, CompiledPom>();
const registeredPoms = new Map<string, RegisteredPom>();
const subscribers = new Set<() => void>();

export function configureAymeRuntime(page: BrowserPage) {
  browserPage = page;
}

export function registerCompiledPom(
  PomClass: object,
  manifest: PomManifest,
  instantiate: (page: BrowserPage) => object
) {
  compiledPoms.set(PomClass, { manifest, instantiate });
}

export function createPageRegistration(PomClass: object) {
  const page = browserPage;
  if (!page)
    throw new Error(
      "Configure the Ayme browser runtime before registering a page object."
    );

  const compiledPom = compiledPoms.get(PomClass);
  if (!compiledPom)
    throw new Error(
      "The imported page object has no compiler-derived Ayme metadata."
    );

  const instance = compiledPom.instantiate(page);
  const registration: RegisteredPom = {
    id: compiledPom.manifest.className,
    instance,
    manifest: compiledPom.manifest,
    memberObservations: [],
    tools: createRegisteredTools(compiledPom.manifest, instance),
  };
  registeredPoms.set(registration.id, registration);
  notifySubscribers();

  return {
    instance: registration.instance,
    dispose() {
      if (registeredPoms.get(registration.id) !== registration) return;
      registeredPoms.delete(registration.id);
      notifySubscribers();
    },
  };
}

export async function probeRegisteredPomMembers() {
  const results = await Promise.all(
    [...registeredPoms.values()].map(async (registration) => ({
      registration,
      memberObservations: await probePomMembers(registration),
    }))
  );

  for (const result of results) {
    if (registeredPoms.get(result.registration.id) !== result.registration)
      continue;
    registeredPoms.set(result.registration.id, {
      ...result.registration,
      memberObservations: result.memberObservations,
    });
  }
  notifySubscribers();
}

export function listRegisteredPoms() {
  return [...registeredPoms.values()];
}

export function listRegisteredTools() {
  return [...registeredPoms.values()].flatMap(
    (registration) => registration.tools
  );
}

export function subscribeToRegisteredPoms(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function notifySubscribers() {
  for (const subscriber of subscribers) subscriber();
}

function createRegisteredTools(manifest: PomManifest, instance: object) {
  const pageTools = manifest.tools.map((tool) =>
    createRegisteredTool(manifest.className, instance, tool)
  );
  const components = new Map(
    manifest.components.map((component) => [component.className, component])
  );
  const collectionTools = manifest.members.flatMap((member) => {
    if (member.kind !== "component" || !member.collection) return [];
    const component = components.get(member.componentClassName);
    if (!component) return [];
    return component.tools.map((tool) =>
      createCollectionTool(
        manifest.className,
        instance,
        member,
        component,
        tool
      )
    );
  });
  return [...pageTools, ...collectionTools];
}

function createRegisteredTool(
  pomId: string,
  instance: object,
  tool: ToolManifest
): RegisteredTool {
  return {
    pomId,
    methodName: tool.methodName,
    name: tool.toolName,
    description: tool.description,
    inputSchema: tool.inputSchema,
    parameters: tool.parameters,
    execute: async (args) => await executeTool(instance, tool, args),
  };
}

function createCollectionTool(
  pomId: string,
  pageInstance: object,
  member: PomComponentMemberManifest,
  component: PomComponentManifest,
  action: ToolManifest
): RegisteredTool {
  const wrapper = collectionToolManifest(pomId, member, action);
  return {
    pomId,
    componentClassName: component.className,
    methodName: action.methodName,
    name: wrapper.toolName,
    description: action.description,
    inputSchema: wrapper.inputSchema,
    parameters: wrapper.parameters,
    execute: async (input) => {
      const [index, args] = validatedArguments(wrapper, input);
      if (typeof index !== "number")
        throw new Error("Collection tool index must be a number.");

      const components = asComponents(await readMember(pageInstance, member));
      const componentInstance = components[index];
      if (!componentInstance || !isRecord(componentInstance)) {
        throw new Error(
          `No ${component.className} instance exists at ${pomId}.${member.memberName}[${index}].`
        );
      }
      return await executeTool(componentInstance, action, args);
    },
  };
}

function collectionToolManifest(
  pomId: string,
  member: PomComponentMemberManifest,
  action: ToolManifest
): ToolManifest {
  const parameters = [
    {
      name: "index",
      optional: false,
      schema: { type: "integer", minimum: 0 } satisfies JsonSchema,
    },
    {
      name: "args",
      optional: false,
      schema: action.inputSchema,
    },
  ];

  return {
    ...action,
    toolName: `${pomId}.${member.memberName}.${action.methodName}`,
    inputSchema: inputSchemaFor(parameters),
    parameters,
  };
}

async function probePomMembers(
  registration: RegisteredPom
): Promise<PomMemberObservation[]> {
  const components = new Map(
    registration.manifest.components.map((component) => [
      component.className,
      component,
    ])
  );
  return await probeMembers(
    registration.instance,
    registration.manifest.members,
    "",
    components
  );
}

async function probeMembers(
  instance: object,
  members: readonly PomMemberManifest[],
  prefix: string,
  components: ReadonlyMap<string, PomComponentManifest>
): Promise<PomMemberObservation[]> {
  const observations: PomMemberObservation[] = [];

  for (const member of members) {
    const memberPath = prefix
      ? `${prefix}.${member.memberName}`
      : member.memberName;
    try {
      const value = await readMember(instance, member);
      if (member.kind === "locator") {
        if (!isBrowserLocator(value))
          throw new Error(`POM member ${memberPath} is not a browser locator.`);
        observations.push({
          memberName: memberPath,
          kind: "locator",
          access: member.access,
          count: await value.count(),
        });
        continue;
      }

      const componentManifest = components.get(member.componentClassName);
      if (!componentManifest)
        throw new Error(
          `No metadata found for component ${member.componentClassName}.`
        );
      const componentValues = member.collection ? asComponents(value) : [value];
      if (member.collection) {
        observations.push({
          memberName: memberPath,
          kind: "component-collection",
          access: member.access,
          count: componentValues.length,
        });
      }

      for (const [index, componentValue] of componentValues.entries()) {
        const componentPath = member.collection
          ? `${memberPath}[${index}]`
          : memberPath;
        if (!isPomComponent(componentValue)) {
          observations.push({
            memberName: `${componentPath}.root`,
            kind: "component-root",
            count: 0,
            error: `POM component ${componentPath} does not expose a browser locator root.`,
          });
          continue;
        }

        observations.push({
          memberName: `${componentPath}.root`,
          kind: "component-root",
          count: await componentValue.root.count(),
        });
        const childMembers = componentManifest.members.filter(
          (child) => !(child.kind === "locator" && child.memberName === "root")
        );
        observations.push(
          ...(await probeMembers(
            componentValue,
            childMembers,
            componentPath,
            components
          ))
        );
      }
    } catch (error) {
      observations.push({
        memberName:
          member.kind === "component" && !member.collection
            ? `${memberPath}.root`
            : memberPath,
        kind:
          member.kind === "locator"
            ? "locator"
            : member.collection
              ? "component-collection"
              : "component-root",
        access: member.access,
        count: 0,
        error: errorMessage(error),
      });
    }
  }

  return observations;
}

async function readMember(instance: object, member: PomMemberManifest) {
  const value = Reflect.get(instance, member.memberName);
  if (member.access === "method") {
    if (!isCallable(value))
      throw new Error(`POM member ${member.memberName} is not callable.`);
    return await value.apply(instance, []);
  }
  return await value;
}

async function executeTool(
  instance: object,
  tool: ToolManifest,
  args: unknown
): Promise<JsonValue> {
  const method = Reflect.get(instance, tool.methodName);
  if (!isCallable(method))
    throw new Error(`POM method ${tool.methodName} is not callable.`);

  const result = await method.apply(instance, validatedArguments(tool, args));
  if (result === undefined) return { ok: true };
  if (isJsonValue(result)) return { ok: true, result };
  return { ok: true, result: String(result) };
}

function validatedArguments(tool: ToolManifest, args: unknown) {
  const input = asRecord(args);
  const knownParameterNames = new Set(
    tool.parameters.map((parameter) => parameter.name)
  );
  for (const name of Object.keys(input)) {
    if (!knownParameterNames.has(name))
      throw new Error(`Unexpected input property ${name}.`);
  }

  return tool.parameters.map((parameter) => {
    const value = input[parameter.name];
    if (value === undefined) {
      if (parameter.optional) return undefined;
      throw new Error(`Missing required input property ${parameter.name}.`);
    }
    validateValue(parameter.name, parameter.schema, value);
    return value;
  });
}

function validateValue(name: string, schema: JsonSchema, value: unknown) {
  if (schema.type === "object") {
    const object = asRecord(value);
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const propertyName of Object.keys(object)) {
        if (!properties[propertyName])
          throw new Error(
            `Input property ${name}.${propertyName} is not supported.`
          );
      }
    }
    for (const requiredProperty of schema.required ?? []) {
      if (object[requiredProperty] === undefined) {
        throw new Error(
          `Input property ${name}.${requiredProperty} is required.`
        );
      }
    }
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      const propertyValue = object[propertyName];
      if (propertyValue !== undefined)
        validateValue(`${name}.${propertyName}`, propertySchema, propertyValue);
    }
    return;
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value) || typeof value !== "number") {
      throw new Error(`Input property ${name} must be an integer.`);
    }
  } else if (schema.type && typeof value !== schema.type) {
    throw new Error(`Input property ${name} must be a ${schema.type}.`);
  }
  if (
    schema.minimum !== undefined &&
    (typeof value !== "number" || value < schema.minimum)
  ) {
    throw new Error(
      `Input property ${name} must be at least ${schema.minimum}.`
    );
  }
  if (
    schema.enum &&
    (!isJsonPrimitive(value) || !schema.enum.includes(value))
  ) {
    throw new Error(
      `Input property ${name} must be one of ${schema.enum.join(", ")}.`
    );
  }
}

function inputSchemaFor(
  parameters: readonly { name: string; optional: boolean; schema: JsonSchema }[]
): JsonSchema {
  const properties = Object.fromEntries(
    parameters.map((parameter) => [parameter.name, parameter.schema])
  );
  const required = parameters
    .filter((parameter) => !parameter.optional)
    .map((parameter) => parameter.name);
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function isBrowserLocator(value: unknown): value is BrowserLocator {
  return isRecord(value) && typeof value.count === "function";
}

function isPomComponent(value: unknown): value is { root: BrowserLocator } {
  return isRecord(value) && isBrowserLocator(value.root);
}

function asComponents(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error("Expected a component collection array.");
  return value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new Error("Tool input must be an object.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
