import { describe, expect, it } from "vitest";

import { aymeWebMcp } from "./vite";

type VitePlugin = Extract<ReturnType<typeof aymeWebMcp>, { config?: unknown }>;
type ConfigHook = Extract<
  NonNullable<VitePlugin["config"]>,
  (...args: never[]) => unknown
>;
type UserConfig = Parameters<ConfigHook>[0];

function applyPluginConfig(config: UserConfig) {
  const plugin = aymeWebMcp();
  if (Array.isArray(plugin)) {
    throw new Error("Expected a single Vite plugin");
  }
  if (typeof plugin.config !== "function") {
    throw new Error("Expected the Vite plugin to define a config hook");
  }

  const configHook = plugin.config;
  return Reflect.apply(configHook, null, [
    config,
    { command: "serve", mode: "test" },
  ]);
}

describe("aymeWebMcp Vite integration", () => {
  it("adds the Playwright test runner exclusion when no optimizer config exists", () => {
    expect(applyPluginConfig({})).toEqual({
      optimizeDeps: { exclude: ["@playwright/test"] },
    });
  });

  it("excludes the Playwright test runner from dependency optimization", () => {
    expect(
      applyPluginConfig({
        optimizeDeps: { exclude: ["existing-dependency"] },
      })
    ).toEqual({
      optimizeDeps: {
        exclude: ["existing-dependency", "@playwright/test"],
      },
    });
  });

  it("does not duplicate an existing Playwright test exclusion", () => {
    expect(
      applyPluginConfig({
        optimizeDeps: { exclude: ["@playwright/test"] },
      })
    ).toEqual({
      optimizeDeps: { exclude: ["@playwright/test"] },
    });
  });
});
