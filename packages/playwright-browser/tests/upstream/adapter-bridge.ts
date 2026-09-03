/**
 * Bridges the @ayme-dev/playwright-browser in-browser adapter with
 * Playwright Test's Node.js fixture. Loads the compiled dist bundle
 * (which includes the real pinned InjectedScript), injects it into
 * the browser page, and creates proxy Page/Locator objects that route
 * all compatibility calls through the adapter.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";

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
  await realPage.goto("about:blank");

  return createPageProxy(realPage);
}

function createPageProxy(realPage: Page): Page {
  return new Proxy(realPage, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (prop === "__aymeAdapter") return true;
      if (prop === "then") return undefined;

      // Locator-creating: return proxy locator.
      if (LOCATOR_CREATING_METHODS.has(prop)) {
        return (...args: unknown[]) =>
          createLocatorProxy(realPage, [[prop, args]]);
      }

      // ── Callback transport ─────────────────────────────────────────
      // Functions cannot be serialized as arguments to realPage.evaluate.
      // We mirror pinned b25d782 client/frame.ts:217-223 semantics:
      //   { expression: String(pageFunction),
      //     isFunction: typeof pageFunction === 'function',
      //     arg }
      // The adapter's _evaluateExpression uses the explicit isFunction
      // flag — never guesses from the string content.

      if (prop === "evaluate") {
        return async (pageFunction: unknown, arg?: unknown) =>
          realPage.evaluate(
            ({ expression, isFunction, arg: a }) => {
              const p = (window as any).__aymeAdapterPage;
              return p._evaluateExpression(expression, isFunction, a);
            },
            {
              expression: String(pageFunction),
              isFunction: typeof pageFunction === "function",
              arg,
            }
          );
      }

      if (prop === "waitForFunction") {
        return async (
          pageFunction: unknown,
          arg?: unknown,
          options?: unknown
        ) => {
          // Use _waitForFunctionExpression with explicit isFunction
          // flag so function-source strings are correctly called.
          // Resolve the handle's value in-browser, wrap result in a
          // minimal handle on the Node side.
          const result = await realPage.evaluate(
            ({ expression, isFunction, arg: a, options: opts }) => {
              const p = (window as any).__aymeAdapterPage;
              return p
                ._waitForFunctionExpression(expression, isFunction, a, opts)
                .then((h: any) => h.jsonValue());
            },
            {
              expression: String(pageFunction),
              isFunction: typeof pageFunction === "function",
              arg,
              options: options as Record<string, unknown>,
            }
          );
          return {
            jsonValue: async () => result,
            dispose: async () => {},
          };
        };
      }

      // ── setContent: string-only, no callback needed ───────────────
      if (prop === "setContent") {
        return async (html: string, options?: unknown) =>
          realPage.evaluate(
            ({ html: h, options: o }: { html: string; options: unknown }) => {
              const p = (window as any).__aymeAdapterPage;
              return p.setContent(h, o);
            },
            { html, options }
          );
      }

      // Everything else: route through the adapter page in the browser.
      // Both method calls and property accesses go through the adapter
      // so that unsupported members (keyboard, mouse, touchscreen, etc.)
      // are never leaked from the real Playwright driver.
      return (...args: unknown[]) =>
        realPage.evaluate(
          ({ member, args: a }) => {
            const p = (window as any).__aymeAdapterPage;
            const v = p[member];
            if (typeof v === "function") return v.call(p, ...a);
            if (a.length === 0 && v !== undefined) return v;
            throw new TypeError(
              `__aymeAdapterPage.${member} is not a function`
            );
          },
          { member: prop, args: args as any[] }
        );
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
