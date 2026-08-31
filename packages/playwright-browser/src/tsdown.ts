import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const expectedArtifactBytes = 331_823;
const expectedArtifactSha256 =
  "03f14c3f208da57cb641f0797328af31dc6182167a0d340bd57846617230cc24";
const playwrightInjectedId = "virtual:ayme-playwright-injected";
const resolvedPlaywrightInjectedId = `\0${playwrightInjectedId}`;

export function playwrightInjectedPlugin() {
  return {
    name: "ayme-playwright-injected",
    resolveId(id: string) {
      if (id === playwrightInjectedId) return resolvedPlaywrightInjectedId;
    },
    load(id: string) {
      if (id !== resolvedPlaywrightInjectedId) return;
      const source = readInjectedScriptSource();
      return [
        "const module = { exports: {} };",
        "const exports = module.exports;",
        source,
        "const AymeInjectedScript = module.exports.InjectedScript();",
        "export { AymeInjectedScript as InjectedScript };",
      ].join("\n");
    },
  };
}

function readInjectedScriptSource() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("playwright-core/package.json");
  const artifactPath = resolve(
    dirname(packagePath),
    "src/generated/injectedScriptSource.ts"
  );
  const artifact = readFileSync(artifactPath);
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  if (
    artifact.byteLength !== expectedArtifactBytes ||
    sha256 !== expectedArtifactSha256
  ) {
    throw new Error(
      "The pinned playwright-core InjectedScript artifact does not match the reviewed build."
    );
  }

  const text = artifact.toString("utf8");
  const prefix = "export const source = ";
  if (!text.startsWith(prefix) || !text.endsWith(";"))
    throw new Error(
      "The pinned playwright-core InjectedScript artifact has an unsupported format."
    );

  const source: unknown = JSON.parse(text.slice(prefix.length, -1));
  if (
    typeof source !== "string" ||
    !source.includes("captureAriaSnapshot(root)")
  ) {
    throw new Error(
      "The pinned playwright-core InjectedScript artifact lacks captureAriaSnapshot."
    );
  }
  return source;
}
