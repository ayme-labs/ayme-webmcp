import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { defineConfig } from "tsdown";

const playwrightInjectedId = "virtual:ayme-playwright-injected";
const resolvedPlaywrightInjectedId = `\0${playwrightInjectedId}`;

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/internal.ts"],
  format: ["esm"],
  plugins: [
    {
      name: "ayme-playwright-injected",
      resolveId(id) {
        if (id === playwrightInjectedId) return resolvedPlaywrightInjectedId;
      },
      load(id) {
        if (id !== resolvedPlaywrightInjectedId) return;
        const source = extractPlaywrightInjectedSource();
        return [
          "const module = { exports: {} };",
          "const exports = module.exports;",
          source,
          "const AymeInjectedScript = module.exports.InjectedScript();",
          "export { AymeInjectedScript as InjectedScript };",
        ].join("\n");
      },
    },
  ],
});

function extractPlaywrightInjectedSource() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("playwright-core/package.json");
  const packageDirectory = dirname(packagePath);
  const coreBundlePath = resolve(packageDirectory, "lib/coreBundle.js");
  const coreBundle = readFileSync(coreBundlePath, "utf8");
  const marker = "// packages/injected/src/injectedScript.ts";
  const markerIndex = coreBundle.indexOf(marker);
  if (markerIndex === -1)
    throw new Error(
      "The pinned playwright-core bundle does not contain InjectedScript source."
    );

  const assignmentPattern = /(?<!\\)\b[A-Za-z_$][\w$]*\s*=\s*'/g;
  let assignment: RegExpExecArray | null = null;
  for (
    let match = assignmentPattern.exec(coreBundle);
    match;
    match = assignmentPattern.exec(coreBundle)
  ) {
    if (match.index >= markerIndex) break;
    assignment = match;
  }
  if (!assignment)
    throw new Error("Unable to locate the Playwright InjectedScript payload.");

  const quoteStart = assignment.index + assignment[0].lastIndexOf("'");
  const quoteEnd = closingQuote(coreBundle, quoteStart);
  const literal = coreBundle.slice(quoteStart, quoteEnd + 1);
  const source = runInNewContext(literal, Object.create(null));
  if (typeof source !== "string" || !source.includes(marker))
    throw new Error(
      "The extracted Playwright InjectedScript payload is invalid."
    );
  return source;
}

function closingQuote(source: string, quoteStart: number) {
  for (let index = quoteStart + 1; index < source.length; index += 1) {
    if (source[index] !== "'") continue;
    let slashCount = 0;
    for (let cursor = index - 1; source[cursor] === "\\"; cursor -= 1)
      slashCount += 1;
    if (slashCount % 2 === 0) return index;
  }
  throw new Error("The Playwright InjectedScript payload is unterminated.");
}
