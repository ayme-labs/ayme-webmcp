import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import ts from "typescript";

const shouldCheck = process.argv.includes("--check");
const shouldPrint = process.argv.includes("--print");
if ([shouldCheck, shouldPrint].filter(Boolean).length !== 1)
  throw new Error("Use exactly one of --check or --print.");

const require = createRequire(import.meta.url);
const declarationPath = join(
  dirname(require.resolve("playwright-core/package.json")),
  "types/types.d.ts"
);
const declarationSource = readFileSync(declarationPath, "utf8");
const upstreamSource = readFileSync(
  join(import.meta.dirname, "../src/upstream.ts"),
  "utf8"
);
const expectedFingerprint = upstreamSource.match(
  /publicSurfaceFingerprint:\s*"(sha256:[a-f0-9]{64})"/
)?.[1];
if (!expectedFingerprint)
  throw new Error(
    "Could not read publicSurfaceFingerprint from src/upstream.ts."
  );
const sourceFile = ts.createSourceFile(
  declarationPath,
  declarationSource,
  ts.ScriptTarget.Latest
);
const fingerprint = sha256(
  (["Page", "Locator"] as const)
    .map((name) => normalizedInterface(name))
    .join("\n")
);

if (shouldPrint) {
  console.log(fingerprint);
} else if (fingerprint !== expectedFingerprint) {
  throw new Error(
    `Playwright Page/Locator public surface drifted: expected ${expectedFingerprint}, received ${fingerprint}. Review the changed declarations and compatibility catalog, then run pnpm fingerprint:surface.`
  );
} else {
  console.log(`verified Playwright Page/Locator surface ${fingerprint}`);
}

function normalizedInterface(name: "Locator" | "Page") {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name
  );
  if (!declaration)
    throw new Error(`Pinned Playwright declarations do not export ${name}.`);

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    declaration.getText(sourceFile)
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

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
