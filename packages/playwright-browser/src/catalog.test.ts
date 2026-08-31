import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  compatibilityCatalog,
  currentSupport,
  upstreamPlaywright,
} from "./index";

const require = createRequire(import.meta.url);

describe("the Playwright compatibility catalog", () => {
  it("classifies every member of the pinned Page and Locator interfaces once", () => {
    const upstreamMembers = membersFromPinnedPlaywrightTypes();
    const catalogMembers = compatibilityCatalog.map(
      (member) => `${member.interface}.${member.member}`
    );

    expect(upstreamMembers.Page).toHaveLength(116);
    expect(upstreamMembers.Locator).toHaveLength(69);
    expect(catalogMembers).toHaveLength(185);
    expect(new Set(catalogMembers).size).toBe(185);
    expect(new Set(catalogMembers)).toEqual(
      new Set([
        ...upstreamMembers.Page.map((member) => `Page.${member}`),
        ...upstreamMembers.Locator.map((member) => `Locator.${member}`),
      ])
    );
  });

  it("keeps selected support separate, fully compatible, and browser-emulated only for actions", () => {
    const catalogByMember = new Map(
      compatibilityCatalog.map((member) => [
        `${member.interface}.${member.member}`,
        member,
      ])
    );

    expect(currentSupport).toHaveLength(47);
    expect(new Set(currentSupport).size).toBe(47);
    for (const member of currentSupport)
      expect(catalogByMember.get(member)?.api).toBe("Full");

    for (const action of ["click", "fill", "press"] as const) {
      const member = catalogByMember.get(`Locator.${action}`);
      expect(member).toMatchObject({
        api: "Full",
        execution: "Browser-emulated",
      });
      expect(currentSupport).toContain(`Locator.${action}`);
    }
  });

  it("records the pinned @playwright/test provenance without a generated runtime", () => {
    const testPackage = JSON.parse(
      readFileSync(require.resolve("@playwright/test/package.json"), "utf8")
    ) as { version: string };

    expect(upstreamPlaywright).toMatchObject({
      package: "@playwright/test",
      version: testPackage.version,
      publicSurfaceFingerprint:
        "sha256:6c688250f2b7061cec3a17ab8797671137b653f8c4e81a6df3190cb112a7579a",
      generatedSource: { status: "pending" },
    });
  });

  it("leaves no browser compatibility export behind in webmcp", () => {
    const publicEntry = readFileSync(
      resolve(process.cwd(), "../webmcp/src/index.ts"),
      "utf8"
    );
    const internalEntry = readFileSync(
      resolve(process.cwd(), "../webmcp/src/internal.ts"),
      "utf8"
    );

    expect(publicEntry).not.toContain("browserPage");
    expect(internalEntry).not.toContain("createBrowserPage");
  });
});

function membersFromPinnedPlaywrightTypes() {
  const path = join(
    dirname(require.resolve("playwright-core/package.json")),
    "types/types.d.ts"
  );
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest
  );
  const members = new Map<string, string[]>();

  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;
    if (statement.name.text !== "Page" && statement.name.text !== "Locator")
      continue;
    members.set(
      statement.name.text,
      [
        ...new Set(
          statement.members.map((member) => member.name?.getText(source))
        ),
      ].filter((member): member is string => Boolean(member))
    );
  }

  return {
    Page: members.get("Page") ?? [],
    Locator: members.get("Locator") ?? [],
  };
}
