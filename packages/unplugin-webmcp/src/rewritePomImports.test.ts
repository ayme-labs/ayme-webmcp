import path from "node:path";

import { describe, expect, it } from "vitest";

import { rewritePomImports } from "./rewritePomImports";

function rewrittenImport(importDeclaration: string) {
  const fileName = path.resolve(
    "../../apps/example-vue/tests/fixtures/rewrite-input.ts"
  );
  return rewritePomImports(
    `${importDeclaration}\nexport const value = 1;\n`,
    fileName
  );
}

describe("rewritePomImports", () => {
  it("bypasses an unused runtime playwright branch", () => {
    expect(
      rewrittenImport('import { safe } from "./rewrite-playwright-barrel";')
    ).toContain('import { safe } from "./rewrite-safe";');
    expect(
      rewrittenImport('import { safe } from "./rewrite-playwright-barrel";')
    ).not.toContain("rewrite-playwright-barrel");
  });

  it("bypasses an unused runtime @playwright/test branch", () => {
    expect(
      rewrittenImport(
        'import { safe } from "./rewrite-playwright-test-barrel";'
      )
    ).toContain('import { safe } from "./rewrite-safe";');
    expect(
      rewrittenImport(
        'import { safe } from "./rewrite-playwright-test-barrel";'
      )
    ).not.toContain("rewrite-playwright-test-barrel");
  });

  it("leaves type-only Playwright branches unchanged", () => {
    const source = rewrittenImport(
      'import { safe } from "./rewrite-type-only-barrel";'
    );
    expect(source).toContain('from "./rewrite-type-only-barrel"');
    expect(source).not.toContain('from "./rewrite-safe"');
  });

  it("leaves a selected Playwright-dependent module unchanged", () => {
    const source = rewrittenImport(
      'import { tainted } from "./rewrite-playwright-barrel";'
    );
    expect(source).toContain('from "./rewrite-playwright-barrel"');
    expect(source).not.toContain('from "./rewrite-playwright-runtime"');
  });

  it("does not taint unrelated exports from a barrel's direct Playwright import", () => {
    const source = rewrittenImport(
      'import { safe } from "./rewrite-direct-playwright-barrel";'
    );
    expect(source).toContain('import { safe } from "./rewrite-safe";');
    expect(source).not.toContain("rewrite-direct-playwright-barrel");
  });

  it("leaves a selected direct Playwright export unchanged", () => {
    const source = rewrittenImport(
      'import { chromium } from "./rewrite-direct-playwright-barrel";'
    );
    expect(source).toContain('from "./rewrite-direct-playwright-barrel"');
  });

  it("leaves unrelated Node-only branches unchanged", () => {
    const source = rewrittenImport(
      'import { safe } from "./rewrite-node-barrel";'
    );
    expect(source).toContain('from "./rewrite-node-barrel"');
    expect(source).not.toContain('from "./rewrite-safe"');
  });

  it("preserves aliases and splits selected modules", () => {
    const source = rewrittenImport(
      'import { safe as first, second } from "./rewrite-playwright-barrel";'
    );
    expect(source).toContain('import { safe as first } from "./rewrite-safe";');
    expect(source).toContain('import { second } from "./rewrite-second";');
    expect(source).not.toContain("rewrite-playwright-barrel");
  });

  it("preserves aliases introduced by a re-export", () => {
    const source = rewrittenImport(
      'import { sourceSafe as localSafe } from "./rewrite-playwright-barrel";'
    );
    expect(source).toContain(
      'import { safe as localSafe } from "./rewrite-safe";'
    );
    expect(source).not.toContain("rewrite-playwright-barrel");
  });

  it("preserves type-only specifiers while splitting runtime imports", () => {
    const source = rewrittenImport(
      'import { safe as first, type TypeOnlyPage } from "./rewrite-playwright-barrel";'
    );
    expect(source).toContain('import { safe as first } from "./rewrite-safe";');
    expect(source).toContain(
      'import { type TypeOnlyPage } from "./rewrite-playwright-type";'
    );
    expect(source).not.toContain("rewrite-playwright-barrel");
  });
});
