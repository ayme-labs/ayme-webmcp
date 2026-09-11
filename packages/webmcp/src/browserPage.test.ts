import { afterEach, expect, it, vi } from "vitest";
const { createBrowserPage } = vi.hoisted(() => ({
  createBrowserPage: vi.fn(() => ({})),
}));
vi.mock("@ayme-dev/playwright-lite", () => ({ createPage: createBrowserPage }));
import { createPage } from "./browserPage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("does not create a browser Page during import", () => {
  expect(createBrowserPage).not.toHaveBeenCalled();
});
it("uses runtime defaults without compiler settings", () => {
  createPage();
  expect(createBrowserPage).toHaveBeenCalledWith({
    testIdAttribute: undefined,
    actionTimeout: undefined,
    navigationTimeout: undefined,
  });
});
it("passes configured test IDs and explicit zero timeouts without losing them", () => {
  vi.stubGlobal("__AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__", "data-pom");
  vi.stubGlobal("__AYME_PLAYWRIGHT_ACTION_TIMEOUT__", 0);
  vi.stubGlobal("__AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__", 37);
  createPage();
  expect(createBrowserPage).toHaveBeenCalledWith({
    testIdAttribute: "data-pom",
    actionTimeout: 0,
    navigationTimeout: 37,
  });
});
