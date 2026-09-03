/**
 * Bridges the @ayme-dev/playwright-browser in-browser adapter with
 * Playwright Test's Node.js fixture. Loads the compiled dist bundle
 * (which includes the real pinned InjectedScript), injects it into
 * the browser page, and creates proxy Page/Locator objects that route
 * compatibility calls through the adapter while forwarding explicit
 * infrastructure through the real Playwright driver.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";

// @ts-expect-error -- .mjs policy module has no type declarations
import {
  DRIVER_ALLOWLIST,
  harnessUnsupportedReason,
} from "./harness-policy.mjs";

export { DRIVER_ALLOWLIST, harnessUnsupportedReason };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER_DIST_PATH = resolve(__dirname, "../../dist/index.mjs");

// Locator-creating page methods: return a proxy locator chain.
const LOCATOR_CREATING_METHODS = new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByTestId",
  "getByTitle",
  "getByAltText",
  "frameLocator",
]);

// Locator chain methods: extend the chain, return a new proxy locator.
const LOCATOR_CHAIN_METHODS = new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByTestId",
  "getByTitle",
  "getByAltText",
  "filter",
  "nth",
  "first",
  "last",
  "and",
  "or",
]);

// ── Adapter bundle ──────────────────────────────────────────────────

let cachedBundle: string | undefined;

function buildAdapterBundle(): string {
  if (cachedBundle) return cachedBundle;

  const dist = readFileSync(ADAPTER_DIST_PATH, "utf8");

  // Strip ES module export declaration so the code runs as a script.
  const js = dist.replace(/^export\s+\{[^}]*\}.*$/gm, "");

  cachedBundle = [
    "window.__aymeAdapter = (function() {",
    js,
    "return { createPage: createPage };",
    "})();",
  ].join("\n");

  return cachedBundle;
}

// ── Page proxy ──────────────────────────────────────────────────────

export async function createAdapterPage(realPage: Page): Promise<Page> {
  const bundle = buildAdapterBundle();

  // Register init scripts: on every navigation, inject the adapter bundle
  // and create the adapter page from the current window.
  await realPage.addInitScript(bundle);
  await realPage.addInitScript(`
    window.__aymeAdapterPage = window.__aymeAdapter.createPage();
  `);

  // Force a navigation so init scripts execute immediately.
  // Tests that use setContent without a prior goto still get the adapter
  // because setContent modifies the document in-place without
  // clearing window globals set by the init scripts.
  await realPage.goto("about:blank");

  return createPageProxy(realPage);
}

function createPageProxy(realPage: Page): Page {
  return new Proxy(realPage, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (prop === "__aymeAdapter") return true;
      if (prop === "then") return undefined;

      // Infrastructure: real Playwright driver.
      if (DRIVER_ALLOWLIST.has(prop)) {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }

      // Locator-creating: return proxy locator.
      if (LOCATOR_CREATING_METHODS.has(prop)) {
        return (...args: unknown[]) =>
          createLocatorProxy(realPage, [[prop, args]]);
      }

      // Everything else: invoke directly on the adapter page in the
      // browser. Unsupported methods hit the natural browser TypeError
      // when the member is undefined — no custom guard needed.
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return async (...args: unknown[]) =>
          realPage.evaluate(
            ({ method, args: a }) => {
              const p = (window as any).__aymeAdapterPage;
              return p[method](...a);
            },
            { method: prop, args: args as any[] }
          );
      }
      return value;
    },
  }) as Page;
}

// ── Locator proxy ───────────────────────────────────────────────────

type ChainStep = [string, unknown[]];

function createLocatorProxy(realPage: Page, chain: ChainStep[]): Locator {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "__aymeAdapter") return true;
      if (prop === "then") return undefined;

      // Chain methods (including first/last): extend the chain and let
      // the actual adapter determine support/behavior.
      if (LOCATOR_CHAIN_METHODS.has(prop as string)) {
        return (...args: unknown[]) =>
          createLocatorProxy(realPage, [...chain, [prop as string, args]]);
      }

      // all(): returns array of proxy locators by index.
      if (prop === "all") {
        return async () => {
          const count: number = await realPage.evaluate(
            ({ chain: c }) => {
              let current: any = (window as any).__aymeAdapterPage;
              for (const [m, a] of c) current = current[m](...a);
              return current.count();
            },
            { chain }
          );
          return Array.from({ length: count }, (_, i) =>
            createLocatorProxy(realPage, [...chain, ["nth", [i]]])
          );
        };
      }

      // page(): return the proxy page.
      if (prop === "page") {
        return () => createPageProxy(realPage);
      }

      // Everything else: terminal evaluation in browser.
      // Unsupported methods hit the natural browser TypeError when the
      // member is undefined on the adapter locator.
      return async (...args: unknown[]) =>
        realPage.evaluate(
          ({ chain: c, method, args: a }) => {
            let current: any = (window as any).__aymeAdapterPage;
            for (const [m, ma] of c) current = current[m](...ma);
            return current[method](...a);
          },
          { chain, method: prop as string, args: args as any[] }
        );
    },
  };
  return new Proxy({}, handler) as unknown as Locator;
}

// harnessUnsupportedReason and DRIVER_ALLOWLIST are re-exported from
// harness-policy.mjs (single source of truth).
