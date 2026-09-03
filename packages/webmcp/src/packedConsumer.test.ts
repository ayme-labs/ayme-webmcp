/**
 * Packed-consumer regression: verifies the full packed-consumer boundary
 * for @ayme-dev/webmcp.
 *
 * 1. The packed manifest must not expose private workspace packages
 *    (@ayme-dev/playwright-browser, @ayme-dev/structural-observation)
 *    as runtime, optional, or peer dependencies.
 * 2. The dist output must not contain unresolved bare imports to them.
 * 3. A temporary consumer project can install the tarball and import
 *    both the public and internal entry points.
 *
 * The build runs into an isolated staging directory so it never mutates
 * the shared workspace `packages/webmcp/dist` that parallel tests read.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const webmcpRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const PRIVATE_PACKAGES = [
  "@ayme-dev/playwright-browser",
  "@ayme-dev/structural-observation",
];

function exec(file: string, args: string[], cwd: string) {
  return execFileSync(file, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  });
}

it(
  "packed @ayme-dev/webmcp contains no private workspace leaks and is importable",
  { timeout: 30_000 },
  () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webmcp-packed-"));
    try {
      // ── Build into isolated staging dir ───────────────────────────
      const stagingDir = path.join(tmpDir, "staging");
      const stagingDist = path.join(stagingDir, "dist");
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.copyFileSync(
        path.join(webmcpRoot, "package.json"),
        path.join(stagingDir, "package.json")
      );
      exec("pnpm", ["exec", "tsdown", "--out-dir", stagingDist], webmcpRoot);

      // ── Pack staging package ──────────────────────────────────────
      const packOutput = exec(
        "npm",
        ["pack", "--pack-destination", tmpDir],
        stagingDir
      );
      const tgzName = packOutput.trim().split("\n").pop()!;
      const tarball = path.isAbsolute(tgzName)
        ? tgzName
        : path.join(tmpDir, tgzName);
      expect(fs.existsSync(tarball)).toBe(true);

      // ── Extract ─────────────────────────────────────────────────────
      const extractDir = path.join(tmpDir, "extract");
      fs.mkdirSync(extractDir, { recursive: true });
      exec("tar", ["xzf", tarball, "-C", extractDir], tmpDir);

      const packedPkgPath = path.join(extractDir, "package", "package.json");
      const packedPkg = JSON.parse(fs.readFileSync(packedPkgPath, "utf-8"));
      const distDir = path.join(extractDir, "package", "dist");

      // ── Assert: manifest has no private deps ────────────────────────
      const depSections = [
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
      ];
      const exposed: string[] = [];
      for (const section of depSections) {
        for (const name of Object.keys(
          (packedPkg[section] ?? {}) as Record<string, string>
        )) {
          if (PRIVATE_PACKAGES.includes(name)) {
            exposed.push(`${section}: ${name}`);
          }
        }
      }
      expect(exposed, "private packages leaked into packed manifest").toEqual(
        []
      );

      // ── Assert: dist artifacts contain no private package references ──
      const textualFiles = fs
        .readdirSync(distDir, { recursive: true, withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            (entry.name.endsWith(".mjs") || entry.name.endsWith(".d.mts"))
        )
        .map((entry) =>
          entry.parentPath === distDir
            ? entry.name
            : path.relative(distDir, path.join(entry.parentPath, entry.name))
        );
      const hits: string[] = [];
      for (const relPath of textualFiles) {
        const contents = fs.readFileSync(path.join(distDir, relPath), "utf-8");
        for (const pkg of PRIVATE_PACKAGES) {
          if (contents.includes(pkg)) {
            hits.push(`${relPath}: ${pkg}`);
          }
        }
      }
      expect(hits, "private package references in dist artifacts").toEqual([]);

      // ── Assert: consumer can install and import ─────────────────────
      const consumerDir = path.join(tmpDir, "consumer");
      fs.mkdirSync(consumerDir, { recursive: true });
      fs.writeFileSync(
        path.join(consumerDir, "package.json"),
        JSON.stringify({
          name: "consumer",
          type: "module",
          version: "0.0.0",
          dependencies: { "@ayme-dev/webmcp": `file:${tarball}` },
        })
      );
      exec(
        "pnpm",
        ["install", "--ignore-scripts", "--no-lockfile"],
        consumerDir
      );

      const checkFile = path.join(consumerDir, "check.mjs");
      fs.writeFileSync(
        checkFile,
        [
          'const main = await import("@ayme-dev/webmcp");',
          'const internal = await import("@ayme-dev/webmcp/internal");',
          'if (typeof main.ayme?.getPageState !== "function") throw new Error("missing named Ayme facade");',
          'if (main.default !== main.ayme) throw new Error("Ayme default differs from named export");',
          'if (typeof main.createBrowserPage !== "function") throw new Error("missing createBrowserPage");',
          'if (typeof internal.configureAymeRuntime !== "function") throw new Error("missing configureAymeRuntime");',
          'console.log("ok");',
        ].join("\n")
      );

      const result = exec(process.execPath, [checkFile], consumerDir);
      expect(result.trim()).toBe("ok");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);
