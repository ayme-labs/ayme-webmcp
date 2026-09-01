import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InjectedScript } from "./generated/injectedScript";
import { runtimeProvenance } from "./generated/provenance";
import { upstreamPlaywright } from "./upstream";

describe("the generated Playwright browser runtime", () => {
  it("is a verified, static artifact with pinned provenance", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "src/generated/injectedScript.js"),
      "utf8"
    );

    expect(InjectedScript).toBeTypeOf("function");
    expect(runtime).not.toContain("coreBundle.js");
    expect(runtime).not.toMatch(/\b(?:eval|Function)\s*\(/);
    expect(
      readFileSync(
        resolve(process.cwd(), "scripts/generate-runtime.ts"),
        "utf8"
      )
    ).not.toContain("coreBundle.js");
    expect(runtimeProvenance.outputHash).toBe(sha256(runtime));
    expect(upstreamPlaywright.generatedSource).toMatchObject({
      status: "verified",
      fingerprint: runtimeProvenance.outputHash,
    });
  });

  it("retains the verified upstream legal files", () => {
    const closure = JSON.parse(
      readFileSync(resolve(process.cwd(), "source-closure.json"), "utf8")
    ) as { legalFiles: { path: string; sha256: string }[] };

    for (const legalFile of closure.legalFiles) {
      expect(
        sha256(
          readFileSync(
            resolve(process.cwd(), "source/playwright-1.62.1", legalFile.path)
          )
        )
      ).toBe(legalFile.sha256);
    }
    expect(closure.legalFiles.map(({ path }) => path)).toEqual([
      "LICENSE",
      "NOTICE",
      "ThirdPartyNotices.txt",
    ]);
  });
});

function sha256(value: Uint8Array | string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
