import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { unpluginFactory } from "./index";

describe("ayme WebMCP transform", () => {
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
