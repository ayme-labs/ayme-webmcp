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

const selectedPageMembers = [
  "Page.ariaSnapshot",
  "Page.content",
  "Page.getByAltText",
  "Page.getByLabel",
  "Page.getByPlaceholder",
  "Page.getByRole",
  "Page.getByTestId",
  "Page.getByText",
  "Page.getByTitle",
  "Page.locator",
  "Page.setDefaultTimeout",
  "Page.title",
  "Page.url",
] as const;

const selectedLocatorMembers = [
  "Locator.all",
  "Locator.allInnerTexts",
  "Locator.allTextContents",
  "Locator.and",
  "Locator.ariaSnapshot",
  "Locator.click",
  "Locator.count",
  "Locator.fill",
  "Locator.filter",
  "Locator.first",
  "Locator.getAttribute",
  "Locator.getByAltText",
  "Locator.getByLabel",
  "Locator.getByPlaceholder",
  "Locator.getByRole",
  "Locator.getByTestId",
  "Locator.getByText",
  "Locator.getByTitle",
  "Locator.innerHTML",
  "Locator.innerText",
  "Locator.inputValue",
  "Locator.isChecked",
  "Locator.isDisabled",
  "Locator.isEditable",
  "Locator.isEnabled",
  "Locator.isHidden",
  "Locator.isVisible",
  "Locator.last",
  "Locator.locator",
  "Locator.nth",
  "Locator.or",
  "Locator.press",
  "Locator.textContent",
  "Locator.waitFor",
] as const;

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

  it("preserves the reviewed compatibility ceiling and required rationales", () => {
    const counts = { Full: 0, Partial: 0, Unsupported: 0 };
    const pageCounts = { Full: 0, Partial: 0, Unsupported: 0 };
    const locatorCounts = { Full: 0, Partial: 0, Unsupported: 0 };
    const executionCounts = { Matched: 0, "Browser-emulated": 0 };
    for (const member of compatibilityCatalog) {
      counts[member.api] += 1;
      (member.interface === "Page" ? pageCounts : locatorCounts)[member.api] +=
        1;
      if (member.api !== "Unsupported") executionCounts[member.execution] += 1;
    }

    expect(counts).toEqual({ Full: 118, Partial: 5, Unsupported: 62 });
    expect(pageCounts).toEqual({ Full: 58, Partial: 2, Unsupported: 56 });
    expect(locatorCounts).toEqual({ Full: 60, Partial: 3, Unsupported: 6 });
    expect(executionCounts).toEqual({
      Matched: 74,
      "Browser-emulated": 49,
    });
    expect(
      compatibilityCatalog
        .filter((member) => member.api === "Partial")
        .map((member) => `${member.interface}.${member.member}`)
    ).toEqual([
      "Page.selectOption",
      "Page.setInputFiles",
      "Locator.drop",
      "Locator.selectOption",
      "Locator.setInputFiles",
    ]);

    for (const member of compatibilityCatalog) {
      if (member.api === "Partial") expect(member.note.trim()).not.toBe("");
      if (member.api === "Unsupported")
        expect(member.reason.trim()).not.toBe("");
    }
  });

  it("keeps selected support separate, fully compatible, and browser-emulated only for actions", () => {
    const catalogByMember = new Map(
      compatibilityCatalog.map((member) => [
        `${member.interface}.${member.member}`,
        member,
      ])
    );

    expect(currentSupport).toEqual([
      ...selectedPageMembers,
      ...selectedLocatorMembers,
    ]);
    expect(selectedPageMembers).toHaveLength(13);
    expect(selectedLocatorMembers).toHaveLength(34);
    for (const member of currentSupport)
      expect(catalogByMember.get(member)?.api).toBe("Full");

    for (const member of selectedPageMembers)
      expect(catalogByMember.get(member)).toMatchObject({
        api: "Full",
        execution: "Matched",
      });

    expect(
      currentSupport.filter(
        (member) =>
          catalogByMember.get(member)?.execution === "Browser-emulated"
      )
    ).toEqual(["Locator.click", "Locator.fill", "Locator.press"]);
  });

  it("records the pinned @playwright/test provenance and generated runtime", () => {
    const testPackage = JSON.parse(
      readFileSync(require.resolve("@playwright/test/package.json"), "utf8")
    ) as { version: string };

    expect(upstreamPlaywright).toMatchObject({
      package: "@playwright/test",
      version: testPackage.version,
      generatedSource: {
        status: "verified",
        fingerprint:
          "sha256:7de5f27b28ba4a08ff4f7ee080f2adecc1847a7719dbf9d31ca032aa4e4d43ba",
      },
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
