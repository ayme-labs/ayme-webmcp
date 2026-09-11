import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import turbopackLoader from "./turbopack-loader";

const resourcePath = fileURLToPath(
  new URL("./__tests__/fixtures/turbopack/CounterPage.ts", import.meta.url)
);
const context = { resourcePath, getOptions: () => ({}) };

it("emits POM registration and JavaScript without Playwright type imports", () => {
  const code = turbopackLoader.call(
    context,
    readFileSync(resourcePath, "utf8")
  );
  expect(code).toMatch(/registerCompiledPom\(CounterPage,/);
  expect(code).toContain('"className": "CounterPage"');
  expect(code).toContain('"methodName": "increment"');
  expect(code).not.toContain("@WebMCP");
  expect(code).not.toContain("@playwright/test");
  expect(code).not.toContain("readonly incrementButton: Locator");
});

it("transpiles ordinary TypeScript when no POM transform is needed", () => {
  const code = turbopackLoader.call(
    { ...context, resourcePath: "/unused/plain.ts" },
    "export const answer: number = 42;"
  );
  expect(code).toContain("export const answer = 42;");
  expect(code).not.toContain("registerCompiledPom");
});

it("reports invalid TypeScript instead of returning broken JavaScript", () => {
  expect(() =>
    turbopackLoader.call(context, "export const broken: = ;")
  ).toThrow("Could not transpile Ayme POM");
});
