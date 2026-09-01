import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { upstreamPlaywright } from "@ayme-dev/playwright-browser/upstream";

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
  const { captureSource } = upstreamPlaywright;
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve(`${captureSource.package}/package.json`);
  const ownPackagePath = resolve(
    dirname(require.resolve("@ayme-dev/playwright-browser/upstream")),
    "../package.json"
  );
  assertCaptureDependency(captureSource, ownPackagePath);
  const artifactPath = resolve(
    dirname(packagePath),
    captureSource.artifact.path
  );
  const artifact = readFileSync(artifactPath);
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  if (
    artifact.byteLength !== captureSource.artifact.bytes ||
    sha256 !== captureSource.artifact.sha256
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

function assertCaptureDependency(
  captureSource: typeof upstreamPlaywright.captureSource,
  packagePath: string
) {
  const packageManifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const repository = captureSource.repository.replace(
    "https://github.com/",
    ""
  );
  const expectedDependency = `github:${repository}#path:/packages/${captureSource.package}&${captureSource.commit}`;
  if (
    packageManifest.dependencies?.[captureSource.package] !== expectedDependency
  ) {
    throw new Error(
      "The playwright-core dependency does not match the reviewed capture source."
    );
  }
}
