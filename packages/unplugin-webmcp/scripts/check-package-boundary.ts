import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const privatePackage = "@ayme-dev/playwright-browser";
const packageRoot = resolve(import.meta.dirname, "..");
const distDirectory = join(packageRoot, "dist");

for (const file of filesUnder(distDirectory)) {
  if (!/\.[cm]?js$/.test(file)) continue;
  if (readFileSync(file, "utf8").includes(privatePackage))
    throw new Error(`Published JavaScript imports ${privatePackage}: ${file}`);
}

const packDirectory = mkdtempSync(join(tmpdir(), "unplugin-webmcp-pack-"));
try {
  execFileSync(
    "pnpm",
    ["pack", "--pack-destination", packDirectory, "--silent"],
    { cwd: packageRoot, stdio: "pipe" }
  );
  const tarball = readdirSync(packDirectory).find((file) =>
    file.endsWith(".tgz")
  );
  if (!tarball) throw new Error("pnpm pack did not produce a tarball.");

  const packedPackage = JSON.parse(
    execFileSync(
      "tar",
      ["-xOf", join(packDirectory, tarball), "package/package.json"],
      { encoding: "utf8" }
    )
  ) as Record<string, unknown>;
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = packedPackage[field];
    if (
      dependencies &&
      typeof dependencies === "object" &&
      privatePackage in dependencies
    )
      throw new Error(
        `Packed package metadata exposes private dependency ${privatePackage} in ${field}.`
      );
  }
} finally {
  rmSync(packDirectory, { force: true, recursive: true });
}

console.log(`verified public package boundary excludes ${privatePackage}`);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
