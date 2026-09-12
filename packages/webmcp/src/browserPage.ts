import { createPage as createBrowserPage } from "@ayme-dev/playwright-lite";

declare const __AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__: string | undefined;
declare const __AYME_PLAYWRIGHT_ACTION_TIMEOUT__: number | undefined;
declare const __AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__: number | undefined;

// Resolve compiler settings at browser Page creation, never during SSR import.
export function createPage() {
  return createBrowserPage({
    testIdAttribute:
      typeof __AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__ === "string"
        ? __AYME_PLAYWRIGHT_TEST_ID_ATTRIBUTE__
        : undefined,
    actionTimeout:
      typeof __AYME_PLAYWRIGHT_ACTION_TIMEOUT__ === "number"
        ? __AYME_PLAYWRIGHT_ACTION_TIMEOUT__
        : undefined,
    navigationTimeout:
      typeof __AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__ === "number"
        ? __AYME_PLAYWRIGHT_NAVIGATION_TIMEOUT__
        : undefined,
  });
}
