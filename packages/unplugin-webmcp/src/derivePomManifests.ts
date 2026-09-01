import path from "node:path";

import {
  compatibilityCatalog,
  type CompatibilityMember,
  type PlaywrightInterface,
} from "@ayme-dev/playwright-browser/catalog";
import { currentSupport } from "@ayme-dev/playwright-browser/currentSupport";
import ts from "typescript";

import type {
  JsonPrimitive,
  JsonSchema,
  PomComponentManifest,
  PomManifest,
  PomMemberAccess,
  PomMemberManifest,
  ToolManifest,
  ToolParameter,
} from "@ayme-dev/webmcp";

export type PomCompilerOptions = {
  tsconfigPath?: string;
};

export type PomCompiler = {
  derivePomManifests(fileName: string): PomManifest[];
};

/**
 * Derives browser POM metadata from a TypeScript project without depending on
 * a particular bundler.
 */
export function createPomCompiler(
  options: PomCompilerOptions = {}
): PomCompiler {
  return {
    derivePomManifests: (fileName) => derivePomManifests(fileName, options),
  };
}

export function derivePomManifests(
  fileName: string,
  options: PomCompilerOptions = {}
): PomManifest[] {
  const absoluteFileName = path.resolve(fileName);
  const config = projectConfigFor(absoluteFileName, options);
  const playwrightTestTypes = playwrightTestTypesFor(
    absoluteFileName,
    config.options
  );
  const program = ts.createProgram({
    rootNames: [
      ...new Set([...config.fileNames, absoluteFileName, playwrightTestTypes]),
    ],
    options: {
      ...config.options,
      noEmit: true,
    },
  });
  const sourceFile = program.getSourceFile(absoluteFileName);
  if (!sourceFile)
    throw new Error(`Could not read POM source ${absoluteFileName}.`);

  const checker = program.getTypeChecker();
  const compatibility = playwrightCompatibility(
    checker,
    program,
    absoluteFileName
  );
  const manifests: PomManifest[] = [];
  const components = new Map<ts.ClassDeclaration, PomComponentManifest>();

  for (const declaration of sourceFile.statements) {
    if (
      !ts.isClassDeclaration(declaration) ||
      !hasWebMcpClassDecorator(declaration)
    )
      continue;
    if (!declaration.name)
      throw new Error("A WebMCP page object needs a class name.");

    const className = declaration.name.text;
    validatePomCompatibility(checker, declaration, compatibility);
    const members = pomMembers(checker, declaration, components, compatibility);
    const tools = toolsForClass(checker, declaration);

    manifests.push({
      className,
      members,
      components: [...components.values()],
      tools,
    });
  }

  return manifests;
}

function projectConfigFor(
  fileName: string,
  options: PomCompilerOptions
): ts.ParsedCommandLine {
  const configPath = options.tsconfigPath
    ? path.resolve(options.tsconfigPath)
    : ts.findConfigFile(
        path.dirname(fileName),
        ts.sys.fileExists,
        "tsconfig.json"
      );
  if (!configPath)
    throw new Error(
      `Could not find a tsconfig.json for POM source ${fileName}.`
    );

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw configError(configPath, configFile.error);

  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );
  const error = config.errors[0];
  if (error) throw configError(configPath, error);
  return config;
}

function configError(configPath: string, diagnostic: ts.Diagnostic) {
  return new Error(
    `Could not read TypeScript project configuration ${configPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
  );
}

function pomMembers(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
  components: Map<ts.ClassDeclaration, PomComponentManifest>,
  compatibility: PlaywrightCompatibility
): PomMemberManifest[] {
  return classMembers(checker, declaration).flatMap(
    (member): PomMemberManifest[] => {
      if (
        !isPublicInstanceMember(member) ||
        !member.name ||
        !ts.isIdentifier(member.name)
      )
        return [];

      const memberInfo = memberValueInfo(checker, member);
      if (!memberInfo) return [];
      if (
        ts.isMethodDeclaration(member) &&
        (toolDecorator(member) !== undefined || member.parameters.length > 0)
      ) {
        return [];
      }

      if (isLocatorType(memberInfo.type)) {
        return [
          {
            memberName: member.name.text,
            kind: "locator",
            access: memberInfo.access,
          },
        ];
      }

      const component = componentType(checker, memberInfo.type);
      if (!component) return [];
      const componentClassName = ensureComponentManifest(
        checker,
        component.declaration,
        components,
        compatibility
      );
      if (!componentClassName) return [];
      return [
        {
          memberName: member.name.text,
          kind: "component",
          access: memberInfo.access,
          componentClassName,
          collection: component.collection,
        },
      ];
    }
  );
}

function classMembers(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration
): ts.ClassElement[] {
  if (!declaration.name) return [];
  const symbol = checker.getSymbolAtLocation(declaration.name);
  if (!symbol) return [];

  return checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
    .flatMap((property) => {
      const member = property.valueDeclaration ?? property.declarations?.[0];
      return member && ts.isClassElement(member) ? [member] : [];
    });
}

function memberValueInfo(
  checker: ts.TypeChecker,
  member: ts.ClassElement
): { access: PomMemberAccess; type: ts.Type } | undefined {
  if (ts.isPropertyDeclaration(member)) {
    return { access: "field", type: checker.getTypeAtLocation(member.name) };
  }
  if (ts.isGetAccessorDeclaration(member)) {
    const signature = checker.getSignatureFromDeclaration(member);
    return signature
      ? { access: "getter", type: checker.getReturnTypeOfSignature(signature) }
      : undefined;
  }
  if (ts.isMethodDeclaration(member)) {
    const signature = checker.getSignatureFromDeclaration(member);
    return signature
      ? { access: "method", type: checker.getReturnTypeOfSignature(signature) }
      : undefined;
  }
  return undefined;
}

function ensureComponentManifest(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
  components: Map<ts.ClassDeclaration, PomComponentManifest>,
  compatibility: PlaywrightCompatibility
) {
  const className = declaration.name?.text;
  if (!className) return undefined;

  const existing = components.get(declaration);
  if (existing) return existing.className;

  components.set(declaration, { className, members: [], tools: [] });
  validatePomCompatibility(checker, declaration, compatibility);
  components.set(declaration, {
    className,
    members: pomMembers(checker, declaration, components, compatibility),
    tools: toolsForClass(checker, declaration),
  });
  return className;
}

function toolsForClass(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration
): ToolManifest[] {
  const className = declaration.name?.text;
  if (!className) throw new Error("A WebMCP tool class needs a class name.");

  return classMembers(checker, declaration).flatMap((member) => {
    if (!isPublicInstanceMember(member) || !ts.isMethodDeclaration(member))
      return [];
    const decorator = toolDecorator(member);
    if (!decorator) return [];
    if (!member.name || !ts.isIdentifier(member.name)) {
      throw new Error(
        `WebMCP tool in ${className} needs an identifier method name.`
      );
    }

    const methodName = member.name.text;
    const description = toolDescription(decorator, className, methodName);
    const parameters = member.parameters.map((parameter) =>
      toolParameter(checker, parameter, className, methodName)
    );
    return [
      {
        methodName,
        toolName: `${className}.${methodName}`,
        description,
        inputSchema: inputSchemaFor(parameters),
        parameters,
      } satisfies ToolManifest,
    ];
  });
}

function componentType(checker: ts.TypeChecker, type: ts.Type) {
  const direct = componentTypeFromValue(checker, type, false);
  if (direct) return direct;
  if (!isNamedType(checker, type, "Promise")) return undefined;

  const promiseType = type as ts.TypeReference;
  const promiseValue = checker.getTypeArguments(promiseType)[0];
  return promiseValue
    ? componentTypeFromValue(checker, promiseValue, true)
    : undefined;
}

function componentTypeFromValue(
  checker: ts.TypeChecker,
  type: ts.Type,
  async: boolean
) {
  const arrayElement = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  if (arrayElement) {
    const declaration = componentDeclaration(checker, arrayElement);
    if (declaration) return { declaration, collection: true, async };
  }

  const declaration = componentDeclaration(checker, type);
  return declaration ? { declaration, collection: false, async } : undefined;
}

function componentDeclaration(checker: ts.TypeChecker, type: ts.Type) {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const declaration = symbol?.declarations?.find(ts.isClassDeclaration);
  if (!declaration) return undefined;

  const constructor = declaration.members.find(ts.isConstructorDeclaration);
  const parameter = constructor?.parameters[0];
  return parameter && isLocatorType(checker.getTypeAtLocation(parameter))
    ? declaration
    : undefined;
}

function isNamedType(checker: ts.TypeChecker, type: ts.Type, name: string) {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return symbol?.getName() === name;
}

function isPublicInstanceMember(member: ts.ClassElement) {
  if (
    !ts.isPropertyDeclaration(member) &&
    !ts.isGetAccessorDeclaration(member) &&
    !ts.isMethodDeclaration(member)
  ) {
    return false;
  }
  if (!member.name || !ts.isIdentifier(member.name)) return false;
  return !(member.modifiers ?? []).some((modifier) =>
    [
      ts.SyntaxKind.PrivateKeyword,
      ts.SyntaxKind.ProtectedKeyword,
      ts.SyntaxKind.StaticKeyword,
    ].includes(modifier.kind)
  );
}

function isLocatorType(type: ts.Type) {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (
    symbol?.getName() === "BrowserLocator" || symbol?.getName() === "Locator"
  );
}

function hasWebMcpClassDecorator(declaration: ts.ClassDeclaration) {
  return (ts.getDecorators(declaration) ?? []).some((decorator) => {
    return (
      ts.isIdentifier(decorator.expression) &&
      decorator.expression.text === "WebMCP"
    );
  });
}

function toolDecorator(
  declaration: ts.MethodDeclaration
): ts.CallExpression | undefined {
  for (const decorator of ts.getDecorators(declaration) ?? []) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    const callee = decorator.expression.expression;
    if (
      !ts.isPropertyAccessExpression(callee) ||
      !ts.isIdentifier(callee.expression) ||
      callee.expression.text !== "WebMCP" ||
      callee.name.text !== "tool"
    ) {
      continue;
    }

    return decorator.expression;
  }
  return undefined;
}

function toolDescription(
  decorator: ts.CallExpression,
  className: string,
  methodName: string
): string {
  const options = decorator.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) {
    throw invalidToolDescription(className, methodName);
  }
  const description = options.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "description"
  );
  if (
    !description ||
    !ts.isPropertyAssignment(description) ||
    !ts.isStringLiteral(description.initializer)
  ) {
    throw invalidToolDescription(className, methodName);
  }
  return description.initializer.text;
}

function invalidToolDescription(className: string, methodName: string) {
  return new Error(
    `WebMCP tool ${className}.${methodName} needs a string description.`
  );
}

type PlaywrightCompatibility = {
  catalog: ReadonlyMap<string, CompatibilityMember>;
  selected: ReadonlySet<string>;
  interfaces: Readonly<Record<PlaywrightInterface, ts.Type>>;
};

function playwrightCompatibility(
  checker: ts.TypeChecker,
  program: ts.Program,
  fileName: string
): PlaywrightCompatibility {
  const catalog = new Map<string, CompatibilityMember>();
  for (const member of compatibilityCatalog) {
    const key = compatibilityKey(member.interface, member.member);
    if (catalog.has(key))
      throw new Error(
        `Duplicate Playwright compatibility catalog member ${key}.`
      );
    catalog.set(key, member);
  }

  const interfaces = playwrightInterfaceTypes(checker, program, fileName);
  const selected = new Set<string>();
  for (const key of currentSupport) {
    if (selected.has(key))
      throw new Error(`Duplicate selected Playwright member ${key}.`);
    selected.add(key);

    const member = catalog.get(key);
    if (!member)
      throw new Error(
        `Selected Playwright member ${key} is absent from the catalog.`
      );
    if (member.api !== "Full")
      throw new Error(
        `Selected Playwright member ${key} is not fully compatible in the catalog.`
      );
    if (
      !checker.getPropertyOfType(interfaces[member.interface], member.member)
    ) {
      throw new Error(
        `Selected Playwright member ${key} does not exist on @playwright/test ${member.interface}.`
      );
    }
  }

  return { catalog, selected, interfaces };
}

function playwrightInterfaceTypes(
  checker: ts.TypeChecker,
  program: ts.Program,
  fileName: string
): Record<PlaywrightInterface, ts.Type> {
  const resolvedFileName = playwrightTestTypesFor(
    fileName,
    program.getCompilerOptions()
  );

  const sourceFile = program.getSourceFile(resolvedFileName);
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol)
    throw new Error(
      "Could not inspect @playwright/test required for Playwright compatibility diagnostics."
    );

  const exports = checker.getExportsOfModule(moduleSymbol);
  return {
    Page: exportedType(checker, exports, "Page"),
    Locator: exportedType(checker, exports, "Locator"),
  };
}

function playwrightTestTypesFor(fileName: string, options: ts.CompilerOptions) {
  const resolved = ts.resolveModuleName(
    "@playwright/test",
    fileName,
    options,
    ts.sys
  ).resolvedModule;
  if (!resolved)
    throw new Error(
      "Could not resolve @playwright/test required for Playwright compatibility diagnostics."
    );
  return resolved.resolvedFileName;
}

function exportedType(
  checker: ts.TypeChecker,
  exports: readonly ts.Symbol[],
  name: PlaywrightInterface
): ts.Type {
  const exported = exports.find((symbol) => symbol.getName() === name);
  if (!exported)
    throw new Error(
      `Could not inspect @playwright/test ${name} required for Playwright compatibility diagnostics.`
    );
  const symbol =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function validatePomCompatibility(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
  compatibility: PlaywrightCompatibility
) {
  const visited = new Set<ts.ClassDeclaration>();
  const validateClass = (current: ts.ClassDeclaration) => {
    if (visited.has(current)) return;
    visited.add(current);
    validatePlaywrightCalls(checker, current, compatibility);

    const classType = declarationType(checker, current);
    for (const baseType of checker.getBaseTypes(classType) ?? []) {
      const baseDeclaration = baseType
        .getSymbol()
        ?.declarations?.find(ts.isClassDeclaration);
      if (baseDeclaration) validateClass(baseDeclaration);
    }
  };

  validateClass(declaration);
}

function declarationType(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration
): ts.InterfaceType {
  const symbol =
    declaration.name && checker.getSymbolAtLocation(declaration.name);
  if (!symbol) throw new Error("A WebMCP page object needs a class name.");
  return checker.getDeclaredTypeOfSymbol(symbol) as ts.InterfaceType;
}

function validatePlaywrightCalls(
  checker: ts.TypeChecker,
  declaration: ts.ClassDeclaration,
  compatibility: PlaywrightCompatibility
) {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const interfaceName = playwrightInterfaceFor(
        checker,
        checker.getTypeAtLocation(node.expression.expression),
        compatibility.interfaces
      );
      if (interfaceName) {
        const key = compatibilityKey(interfaceName, node.expression.name.text);
        const member = compatibility.catalog.get(key);
        if (!member)
          throw new Error(
            `Playwright member ${key} is not classified in the compatibility catalog.`
          );
        if (member.api === "Unsupported")
          throw new Error(
            `Playwright member ${key} is architecturally unsupported.`
          );
        if (!compatibility.selected.has(key)) {
          throw new Error(
            `Playwright member ${key} is compatible but unavailable in the current browser runtime.`
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(declaration, visit);
}

function playwrightInterfaceFor(
  checker: ts.TypeChecker,
  type: ts.Type,
  interfaces: Readonly<Record<PlaywrightInterface, ts.Type>>
): PlaywrightInterface | undefined {
  for (const interfaceName of ["Page", "Locator"] as const) {
    if (sameTypeSymbol(checker, type, interfaces[interfaceName]))
      return interfaceName;
  }
  return undefined;
}

function sameTypeSymbol(
  checker: ts.TypeChecker,
  left: ts.Type,
  right: ts.Type
) {
  const checked = new Set<ts.Type>();
  const matches = (candidate: ts.Type): boolean => {
    if (checked.has(candidate)) return false;
    checked.add(candidate);

    const leftSymbol = resolvedTypeSymbol(checker, candidate);
    const rightSymbol = resolvedTypeSymbol(checker, right);
    if (leftSymbol !== undefined && leftSymbol === rightSymbol) return true;

    const constraint = checker.getBaseConstraintOfType(candidate);
    return (
      constraint !== undefined &&
      constraint !== candidate &&
      matches(constraint)
    );
  };

  return matches(left);
}

function resolvedTypeSymbol(checker: ts.TypeChecker, type: ts.Type) {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function compatibilityKey(interfaceName: PlaywrightInterface, member: string) {
  return `${interfaceName}.${member}`;
}

function toolParameter(
  checker: ts.TypeChecker,
  parameter: ts.ParameterDeclaration,
  className: string,
  methodName: string
): ToolParameter {
  if (!ts.isIdentifier(parameter.name)) {
    throw new Error(
      `WebMCP tool ${className}.${methodName} needs identifier parameter names.`
    );
  }

  const type = checker.getTypeAtLocation(parameter);
  const optional =
    parameter.questionToken !== undefined || typeIncludesUndefined(type);
  return {
    name: parameter.name.text,
    optional,
    schema: schemaForType(
      checker,
      type,
      className,
      methodName,
      parameter.name.text
    ),
  };
}

function schemaForType(
  checker: ts.TypeChecker,
  type: ts.Type,
  className: string,
  methodName: string,
  parameterName: string
): JsonSchema {
  const membersWithoutUndefined = type.isUnion()
    ? type.types.filter(
        (member) => (member.flags & ts.TypeFlags.Undefined) === 0
      )
    : undefined;
  if (membersWithoutUndefined && membersWithoutUndefined.length === 1) {
    return schemaForType(
      checker,
      membersWithoutUndefined[0],
      className,
      methodName,
      parameterName
    );
  }

  if (type.isUnion()) {
    const members = membersWithoutUndefined ?? [];
    const enumValues = members.map((member) => literalValue(checker, member));
    if (enumValues.every((value) => value !== undefined)) {
      const values = enumValues.filter(
        (value): value is JsonPrimitive => value !== undefined
      );
      const valueTypes = new Set(values.map((value) => typeof value));
      if (valueTypes.size === 1) {
        const type = jsonPrimitiveSchemaType(values[0]);
        if (type === "boolean" && values.length === 2) return { type };
        if (type) return { type, enum: values };
      }
    }
  }

  if (type.flags & ts.TypeFlags.StringLike) return { type: "string" };
  if (type.flags & ts.TypeFlags.NumberLike) return { type: "number" };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type: "boolean" };

  if (type.flags & ts.TypeFlags.Object) {
    return objectSchemaForType(
      checker,
      type,
      className,
      methodName,
      parameterName
    );
  }

  throw unsupportedInputType(
    checker,
    type,
    className,
    methodName,
    parameterName
  );
}

function objectSchemaForType(
  checker: ts.TypeChecker,
  type: ts.Type,
  className: string,
  methodName: string,
  parameterName: string
): JsonSchema {
  if (
    checker.isArrayType(type) ||
    checker.isTupleType(type) ||
    checker.getIndexTypeOfType(type, ts.IndexKind.String)
  ) {
    throw unsupportedInputType(
      checker,
      type,
      className,
      methodName,
      parameterName
    );
  }
  if (type.getCallSignatures().length || type.getConstructSignatures().length) {
    throw unsupportedInputType(
      checker,
      type,
      className,
      methodName,
      parameterName
    );
  }

  const properties = checker.getPropertiesOfType(type);
  const schemaProperties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const property of properties) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration || !ts.isPropertySignature(declaration)) {
      throw unsupportedInputType(
        checker,
        type,
        className,
        methodName,
        parameterName
      );
    }

    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      declaration
    );
    schemaProperties[property.name] = schemaForType(
      checker,
      propertyType,
      className,
      methodName,
      property.name
    );
    if (
      !(property.flags & ts.SymbolFlags.Optional) &&
      !typeIncludesUndefined(propertyType)
    ) {
      required.push(property.name);
    }
  }

  return {
    type: "object",
    properties: schemaProperties,
    required,
    additionalProperties: false,
  };
}

function unsupportedInputType(
  checker: ts.TypeChecker,
  type: ts.Type,
  className: string,
  methodName: string,
  parameterName: string
) {
  return new Error(
    `Unsupported WebMCP input type for ${className}.${methodName}(${parameterName}): ${checker.typeToString(type)}.`
  );
}

function literalValue(
  checker: ts.TypeChecker,
  type: ts.Type
): JsonPrimitive | undefined {
  if (type.isStringLiteral()) return type.value;
  if (type.isNumberLiteral()) return type.value;
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return checker.typeToString(type) === "true";
  }
  return undefined;
}

function jsonPrimitiveSchemaType(value: JsonPrimitive): JsonSchema["type"] {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return undefined;
}

function typeIncludesUndefined(type: ts.Type) {
  return (
    type.isUnion() &&
    type.types.some((member) => (member.flags & ts.TypeFlags.Undefined) !== 0)
  );
}

function inputSchemaFor(parameters: readonly ToolParameter[]): JsonSchema {
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
