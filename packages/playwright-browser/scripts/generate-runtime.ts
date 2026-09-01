import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "esbuild";

import { upstreamPlaywright } from "@ayme-dev/playwright-browser/upstream";

const packageRoot = resolve(import.meta.dirname, "..");
const storedSourceRoot = resolve(
  packageRoot,
  `source/playwright-${upstreamPlaywright.version}`
);
const sourceRoot = materializeSourceTree(storedSourceRoot);
const generatedRoot = resolve(packageRoot, "src/generated");
const closurePath = resolve(packageRoot, "source-closure.json");
const runtimePath = resolve(generatedRoot, "injectedScript.js");
const provenancePath = resolve(generatedRoot, "provenance.ts");
const declarationPath = resolve(generatedRoot, "injectedScript.d.ts");
const legalFileNames = ["LICENSE", "NOTICE", "ThirdPartyNotices.txt"] as const;
const shouldUpdate = process.argv.includes("--update");
const shouldCheck = process.argv.includes("--check");
const shouldVerify = process.argv.includes("--verify");
const runtimeDeclaration = `export type InjectedScriptOptions = {\n  browserName: string;\n  customEngines: { name: string; source: string }[];\n  frameSeq: number;\n  isUnderTest: boolean;\n  isUtilityWorld?: boolean;\n  sdkLanguage: string;\n  shouldPrependErrorPrefix?: boolean;\n  stableRafCount: number;\n  testIdAttributeName: string;\n};\n\nexport declare class InjectedScript {\n  constructor(window: Window & typeof globalThis, options: InjectedScriptOptions);\n  ariaSnapshot(element: Element, options: { boxes?: boolean; depth?: number; mode: "ai" | "default" | "codegen" }): string;\n  elementState(element: Element, state: string): { matches: boolean };\n  generateSelector(target: Element, options: { testIdAttributeName: string }): { selector: string };\n  parseSelector(selector: string): unknown;\n  querySelectorAll(selector: unknown, root: Document | Element): Element[];\n}\n\ndeclare global {\n  var AymePlaywrightRuntime: { InjectedScript: typeof InjectedScript };\n}\n`;

if ([shouldUpdate, shouldCheck, shouldVerify].filter(Boolean).length !== 1)
  throw new Error("Use exactly one of --update, --check, or --verify.");

const result = await build({
  absWorkingDir: sourceRoot,
  bundle: true,
  entryPoints: ["packages/injected/src/injectedScript.ts"],
  footer: {
    js: "globalThis.AymePlaywrightRuntime = { InjectedScript };",
  },
  format: "esm",
  loader: { ".css": "text" },
  metafile: true,
  platform: "browser",
  target: "es2019",
  tsconfig: "tsconfig.json",
  write: false,
});
const runtime = hardenDynamicEvaluation(singleOutput(result.outputFiles));
const files = Object.keys(result.metafile.inputs)
  .map((path) => path.replace("?inline", ""))
  .sort();
const closure = {
  upstream: {
    commit: "26a9e470a7b3c7822084b09fb7f13902c5f37b51",
    repository: "https://github.com/microsoft/playwright.git",
    version: upstreamPlaywright.version,
  },
  files: await Promise.all(
    files.map(async (path) => ({
      path,
      sha256: sha256(await readFile(storedSourcePath(path))),
    }))
  ),
  legalFiles: await Promise.all(
    legalFileNames.map(async (path) => ({
      path,
      sha256: sha256(await readFile(resolve(storedSourceRoot, path))),
    }))
  ),
};
const closureJson = `${JSON.stringify(closure, null, 2)}\n`;
assertEqual(
  closureJson,
  await readFile(closurePath, "utf8"),
  "trusted upstream source closure"
);

if (shouldCheck || shouldVerify) {
  assertEqual(
    runtime,
    await readFile(runtimePath, "utf8"),
    "generated runtime"
  );
  assertEqual(
    provenanceSource(closureJson, runtime),
    await readFile(provenancePath, "utf8"),
    "runtime provenance"
  );
  assertEqual(
    runtimeDeclaration,
    await readFile(declarationPath, "utf8"),
    "runtime declaration"
  );
  if (shouldVerify) {
    const rebuilt = hardenDynamicEvaluation(
      singleOutput(
        (
          await build({
            absWorkingDir: sourceRoot,
            bundle: true,
            entryPoints: ["packages/injected/src/injectedScript.ts"],
            footer: {
              js: "globalThis.AymePlaywrightRuntime = { InjectedScript };",
            },
            format: "esm",
            loader: { ".css": "text" },
            platform: "browser",
            target: "es2019",
            tsconfig: "tsconfig.json",
            write: false,
          })
        ).outputFiles
      )
    );
    assertEqual(runtime, rebuilt, "second generated runtime");
    console.log(
      `deterministic ${sha256(runtime)} from ${files.length} pinned source files`
    );
  } else {
    console.log(
      `verified ${sha256(runtime)} from ${files.length} pinned source files`
    );
  }
} else {
  await mkdir(generatedRoot, { recursive: true });
  await Promise.all([
    writeFile(runtimePath, runtime),
    writeFile(provenancePath, provenanceSource(closureJson, runtime)),
    writeFile(declarationPath, runtimeDeclaration),
  ]);
  console.log(
    `generated ${sha256(runtime)} from ${files.length} pinned source files`
  );
}

function singleOutput(outputFiles: { path: string; text: string }[]) {
  if (outputFiles.length !== 1)
    throw new Error("Expected exactly one JavaScript runtime output.");
  return outputFiles[0].text;
}

function materializeSourceTree(storedRoot: string) {
  const root = mkdtempSync(join(tmpdir(), "ayme-playwright-source-"));
  cpSync(storedRoot, root, { recursive: true });
  restoreTypeScriptExtensions(root);
  process.on("exit", () => rmSync(root, { force: true, recursive: true }));
  return root;
}

function restoreTypeScriptExtensions(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) restoreTypeScriptExtensions(path);
    else if (entry.name.endsWith(".ts.source"))
      renameSync(path, path.slice(0, -".source".length));
  }
}

function storedSourcePath(path: string) {
  return resolve(
    storedSourceRoot,
    path.endsWith(".ts") ? `${path}.source` : path
  );
}

function hardenDynamicEvaluation(source: string) {
  let hardened = source;
  hardened = replaceOnce(
    hardened,
    "this.global.eval(expression)",
    "dynamicSourceIsDisabled()"
  );
  hardened = replaceOnce(
    hardened,
    "this._engines.set(name, this.eval(source));",
    "throw dynamicSourceIsDisabled();"
  );
  hardened = replaceOnce(
    hardened,
    "  eval(expression) {\n    return this.window.eval(expression);\n  }",
    "  dynamicSourceIsDisabled() {\n    return dynamicSourceIsDisabled();\n  }"
  );
  hardened = replaceOnce(
    hardened,
    "  extend(source, params) {\n    const constrFunction = this.window.eval(`\n    (() => {\n      const module = {};\n      ${source}\n      return module.exports.default();\n    })()`);\n    return new constrFunction(this, params);\n  }",
    "  extend() {\n    return dynamicSourceIsDisabled();\n  }"
  );
  hardened = `function dynamicSourceIsDisabled() {\n  throw new Error("Dynamic source execution is disabled in this browser runtime.");\n}\n\n${hardened}`;
  if (/\b(?:eval|Function)\s*\(/.test(hardened))
    throw new Error("Generated runtime still contains dynamic evaluation.");
  return hardened;
}

function replaceOnce(source: string, from: string, to: string) {
  const occurrences = source.split(from).length - 1;
  if (occurrences !== 1)
    throw new Error(
      `Expected one hardening target, found ${occurrences}: ${from}`
    );
  return source.replace(from, to);
}

function provenanceSource(closure: string, runtime: string) {
  return `export const runtimeProvenance = ${JSON.stringify(
    {
      closureHash: sha256(closure),
      generatedAt: "maintainer-time",
      inputHash: sha256(
        JSON.stringify(
          JSON.parse(closure).files.map(
            (file: { path: string; sha256: string }) => [file.path, file.sha256]
          )
        )
      ),
      license: "Apache-2.0",
      notice: `../../source/playwright-${upstreamPlaywright.version}/NOTICE`,
      outputHash: sha256(runtime),
      thirdPartyNotices: `../../source/playwright-${upstreamPlaywright.version}/ThirdPartyNotices.txt`,
      upstream: JSON.parse(closure).upstream,
    },
    null,
    2
  )} as const;\n`;
}

function sha256(value: Uint8Array | string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertEqual(expected: string, actual: string, label: string) {
  if (expected !== actual)
    throw new Error(
      `${label} drifted; run pnpm generate:runtime after reviewing pinned inputs.`
    );
}
