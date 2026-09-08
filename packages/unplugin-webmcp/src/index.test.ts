import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { unpluginFactory } from "./index";

describe("ayme WebMCP transform", () => {
  it("loads testIdAttribute through the consumer dependency with Playwright precedence", async () => {
    const root = mkdtempSync(join(tmpdir(), "ayme-webmcp-playwright-"));
    const playwrightRoot = join(
      root,
      "node_modules/@playwright/test/node_modules/playwright"
    );
    try {
      mkdirSync(join(playwrightRoot, "lib/common"), { recursive: true });
      writeFileSync(join(root, "package.json"), "{}");
      writeFileSync(join(root, "playwright.config.js"), "module.exports = {};");
      writeFileSync(join(root, "playwright.config.mts"), "export default {};");
      writeFileSync(
        join(root, "node_modules/@playwright/test/package.json"),
        "{}"
      );
      writeFileSync(join(playwrightRoot, "package.json"), "{}");
      writeFileSync(
        join(playwrightRoot, "lib/common/index.js"),
        `exports.configLoader = {
  loadConfigFromFile: async (configFile) => ({
    projects: [{
      project: {
        use: {
          testIdAttribute: configFile.endsWith(".js") ? "data-qa" : "data-mts",
        },
      },
    }],
  }),
};`
      );

      const pluginResult = unpluginFactory(
        {},
        { framework: "vite", versions: {} }
      );
      const plugin = Array.isArray(pluginResult)
        ? pluginResult[0]
        : pluginResult;
      if (!plugin?.vite?.config) throw new Error("Expected Vite config hook.");
      const configHook = plugin.vite.config;
      const config = (await Reflect.apply(
        typeof configHook === "function" ? configHook : configHook.handler,
        undefined,
        [{ root }]
      )) as { define?: Record<string, unknown> };

      expect(config.define).toMatchObject({
        __AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__: JSON.stringify("data-qa"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the default testIdAttribute without a Playwright config", async () => {
    const root = mkdtempSync(join(tmpdir(), "ayme-webmcp-no-config-"));
    try {
      writeFileSync(join(root, "package.json"), "{}");
      const pluginResult = unpluginFactory(
        {},
        { framework: "vite", versions: {} }
      );
      const plugin = Array.isArray(pluginResult)
        ? pluginResult[0]
        : pluginResult;
      if (!plugin?.vite?.config) throw new Error("Expected Vite config hook.");
      const configHook = plugin.vite.config;
      const config = (await Reflect.apply(
        typeof configHook === "function" ? configHook : configHook.handler,
        undefined,
        [{ root }]
      )) as { define?: Record<string, unknown> };

      expect(config.define).toMatchObject({
        __AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__: JSON.stringify("data-testid"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("registers metadata without generating a constructor factory", async () => {
    const fixturePath = fileURLToPath(
      new URL("./fixtures/annotatedChildrenPom.ts", import.meta.url)
    );
    const source = readFileSync(fixturePath, "utf8");
    const pluginResult = unpluginFactory(
      {},
      { framework: "vite", versions: {} }
    );
    const plugin = Array.isArray(pluginResult) ? pluginResult[0] : pluginResult;
    if (!plugin) throw new Error("Expected a plugin.");
    const transform = plugin.transform;

    if (!transform || typeof transform === "function")
      throw new Error("Expected an object transform hook.");

    const result: unknown = await Reflect.apply(transform.handler, undefined, [
      source,
      fixturePath,
    ]);
    if (
      !result ||
      typeof result === "string" ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "string"
    )
      throw new Error("Expected transformed code.");

    const registrations = result.code
      .split("\n")
      .filter((line) => line.startsWith("registerCompiledPom("));

    expect(registrations).toHaveLength(2);
    expect(registrations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("registerCompiledPom(AnnotatedComponent, "),
        expect.stringContaining("registerCompiledPom(AnnotatedChildrenPom, "),
      ])
    );
    expect(registrations.every((line) => !line.includes("=> new "))).toBe(true);
  });
});
