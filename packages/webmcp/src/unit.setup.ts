import { vi } from "vitest";

// Geometry is tested in Chromium, not in Node or layoutless jsdom fixtures.
vi.mock("@ayme-dev/playwright-browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ayme-dev/playwright-browser")>()),
  probeLocatorReachability: async () => true,
}));
