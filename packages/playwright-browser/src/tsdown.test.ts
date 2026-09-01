import { describe, expect, it } from "vitest";

import { playwrightInjectedPlugin } from "./tsdown";
import { upstreamPlaywright } from "./upstream";

describe("the Playwright capture source", () => {
  it("loads the artifact pinned by its single provenance record", () => {
    expect(upstreamPlaywright.captureSource).toMatchObject({
      package: "playwright-core",
      repository: "https://github.com/enekesabel/playwright",
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
      artifact: {
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });

    const plugin = playwrightInjectedPlugin();
    const resolvedId = plugin.resolveId("virtual:ayme-playwright-injected");
    expect(resolvedId).toBe("\0virtual:ayme-playwright-injected");
    expect(plugin.load(resolvedId!)).toContain(
      "export { AymeInjectedScript as InjectedScript }"
    );
  });
});
