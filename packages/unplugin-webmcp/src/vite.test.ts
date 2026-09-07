import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { aymeWebMcp } from "./vite";

type VitePlugin = Extract<ReturnType<typeof aymeWebMcp>, { config?: unknown }>;
type ConfigHook = Extract<
  NonNullable<VitePlugin["config"]>,
  (...args: never[]) => unknown
>;
type UserConfig = Parameters<ConfigHook>[0];

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ID_ATTRIBUTE_DEFINE = "__AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__";

async function applyPluginConfig(config: UserConfig) {
  const plugin = aymeWebMcp();
  if (Array.isArray(plugin)) {
    throw new Error("Expected a single Vite plugin");
  }
  if (typeof plugin.config !== "function") {
    throw new Error("Expected the Vite plugin to define a config hook");
  }

  const configHook = plugin.config;
  return await Reflect.apply(configHook, null, [
    config,
    { command: "serve", mode: "test" },
  ]);
}

describe("aymeWebMcp Vite integration", () => {
  it("adds the Playwright test runner exclusion when no optimizer config exists", async () => {
    await expect(applyPluginConfig({})).resolves.toEqual({
      define: { [TEST_ID_ATTRIBUTE_DEFINE]: '"data-testid"' },
      optimizeDeps: { exclude: ["@playwright/test"] },
    });
  });

  it("excludes the Playwright test runner from dependency optimization", async () => {
    await expect(
      applyPluginConfig({
        optimizeDeps: { exclude: ["existing-dependency"] },
      })
    ).resolves.toEqual({
      define: { [TEST_ID_ATTRIBUTE_DEFINE]: '"data-testid"' },
      optimizeDeps: {
        exclude: ["existing-dependency", "@playwright/test"],
      },
    });
  });

  it("does not duplicate an existing Playwright test exclusion", async () => {
    await expect(
      applyPluginConfig({
        optimizeDeps: { exclude: ["@playwright/test"] },
      })
    ).resolves.toEqual({
      define: { [TEST_ID_ATTRIBUTE_DEFINE]: '"data-testid"' },
      optimizeDeps: { exclude: ["@playwright/test"] },
    });
  });

  it("compiles the consumer's Playwright test-id attribute into the browser bundle", async () => {
    await expect(
      applyPluginConfig({
        root: resolve(__dirname, "fixtures/playwright-test-id"),
      })
    ).resolves.toEqual({
      define: { [TEST_ID_ATTRIBUTE_DEFINE]: '"data-pw,data-ti"' },
      optimizeDeps: { exclude: ["@playwright/test"] },
    });
  });
});
