import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import ts from "typescript";

export const playwrightInterfaceNames = ["Page", "Locator"] as const;

export function readPlaywrightPublicSurface() {
  const require = createRequire(import.meta.url);
  const entryPath = join(
    dirname(require.resolve("@playwright/test/package.json")),
    "index.d.ts"
  );
  const program = ts.createProgram([entryPath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
  });
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(entryPath);
  const module = entry && checker.getSymbolAtLocation(entry);
  if (!module)
    throw new Error("Could not resolve the @playwright/test type exports.");

  const exports = checker.getExportsOfModule(module);
  return Object.fromEntries(
    playwrightInterfaceNames.map((interfaceName) => {
      const exported = exports.find((symbol) => symbol.name === interfaceName);
      if (!exported)
        throw new Error(`@playwright/test does not export ${interfaceName}.`);
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      const members = checker
        .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
        .map((member) => ({
          declarations: normalizedDeclarations(member),
          name: declaredName(member),
        }));
      return [interfaceName, members] as const;
    })
  ) as Record<
    (typeof playwrightInterfaceNames)[number],
    { declarations: string; name: string }[]
  >;
}

export function normalizedPlaywrightPublicSurface() {
  const surface = readPlaywrightPublicSurface();
  return playwrightInterfaceNames
    .flatMap((interfaceName) => [
      interfaceName,
      ...surface[interfaceName]
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .flatMap(({ declarations, name }) => [name, declarations]),
    ])
    .join("\n");
}

function declaredName(symbol: ts.Symbol) {
  const declaration = symbol
    .getDeclarations()
    ?.find(
      (candidate): candidate is ts.NamedDeclaration => "name" in candidate
    );
  return declaration?.name?.getText() ?? symbol.getName();
}

function normalizedDeclarations(symbol: ts.Symbol) {
  const declarations = symbol.getDeclarations();
  if (!declarations?.length)
    throw new Error(
      `Playwright member ${symbol.getName()} has no declaration.`
    );
  return declarations
    .toSorted(
      (left, right) =>
        left
          .getSourceFile()
          .fileName.localeCompare(right.getSourceFile().fileName) ||
        left.pos - right.pos
    )
    .map((declaration) => normalizedTokens(declaration.getText()))
    .join("\n");
}

function normalizedTokens(source: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source
  );
  const tokens: string[] = [];
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  )
    tokens.push(scanner.getTokenText());
  return tokens.join("\n");
}
