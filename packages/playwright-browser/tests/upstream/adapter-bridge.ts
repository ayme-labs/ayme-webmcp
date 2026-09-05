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

import type { Frame, Locator, Page } from "@playwright/test";

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

  // Single init script: on every navigation, inject the adapter bundle
  // and create the adapter page from the current window.
  // W-28 AC1: deterministic single-script initialization.
  await realPage.addInitScript(
    bundle + "\nwindow.__aymeAdapterPage = window.__aymeAdapter.createPage();"
  );

  // Force a navigation so init scripts execute immediately.
  await realPage.goto("about:blank");

  await realPage.evaluate(() => {
    const host = window as any;
    host.__aymeEvidence = { entered: [], failures: [] };
    const wrapped = new WeakSet<object>();
    const instrument = (object: any, kind: string): any => {
      if (!object || typeof object !== "object" || wrapped.has(object))
        return object;
      wrapped.add(object);
      const prototype = Object.getPrototypeOf(object);
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (
          name === "constructor" ||
          typeof Object.getOwnPropertyDescriptor(prototype, name)?.value !==
            "function"
        )
          continue;
        const original = object[name];
        const publicName =
          name === "_evaluateExpression"
            ? "evaluate"
            : name === "_waitForFunctionExpression"
              ? "waitForFunction"
              : name;
        object[name] = function (...args: unknown[]) {
          host.__aymeEvidence.entered.push(`${kind}.${publicName}`);
          const result = original.apply(this, args);
          if (
            result &&
            typeof result.then !== "function" &&
            typeof result.count === "function"
          )
            instrument(result, "Locator");
          return result;
        };
      }
      return object;
    };
    instrument(host.__aymeAdapterPage, "Page");
  });

  const evaluate = realPage.evaluate.bind(realPage);
  const failures: string[] = [];
  (realPage as any).__aymeTransportFailures = failures;
  realPage.evaluate = (async (...args: any[]) => {
    try {
      return await (evaluate as any)(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /is not a function|serializ|execution context|target.*closed/i.test(
          message
        )
      )
        failures.push(message.split("\n")[0]);
      throw error;
    }
  }) as Page["evaluate"];
  return createPageProxy(realPage);
}

function createPageProxy(realPage: Page): Page {
  return new Proxy(realPage, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (prop === "__aymeAdapter") return true;
      if (prop === "then") return undefined;

      // mainFrame() is synchronous, but its browser-side result cannot cross
      // the evaluate boundary. Preserve the call as a deferred browser chain
      // and materialize a proxy for the single controlled document.
      if (prop === "mainFrame")
        return () => createFrameProxy(realPage, [["mainFrame", []]]);

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

      // Page.$eval/$$eval are direct browser callbacks in the production
      // adapter. The Node fixture is the sole process boundary, so only this
      // bridge reconstructs the callback source before invoking that API.
      if (prop === "$eval" || prop === "$$eval") {
        return async (selector: string, pageFunction: unknown, arg?: unknown) =>
          realPage.evaluate(
            ({ method, selector: s, expression, arg: a }) => {
              const p = (window as any).__aymeAdapterPage;
              const callback = (0, eval)(`(${expression})`);
              return p[method](s, callback, a);
            },
            {
              method: prop,
              selector,
              expression: String(pageFunction),
              arg,
            }
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

function createFrameProxy(realPage: Page, chain: ChainStep[]): Frame {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "__aymeAdapter") return true;
        if (prop === "then") return undefined;

        if (LOCATOR_CREATING_METHODS.has(prop as string)) {
          return (...args: unknown[]) =>
            createLocatorProxy(realPage, [...chain, [prop as string, args]]);
        }

        return (...args: unknown[]) =>
          realPage.evaluate(
            ({ chain: c, member, args: a }) => {
              let current: any = (window as any).__aymeAdapterPage;
              for (const [method, methodArgs] of c)
                current = current[method](...methodArgs);
              const value = current[member];
              if (typeof value === "function") return value.call(current, ...a);
              if (a.length === 0 && value !== undefined) return value;
              throw new TypeError(`${member} is not a function`);
            },
            { chain, member: prop as string, args: args as any[] }
          );
      },
    }
  ) as Frame;
}

// ── Locator proxy ───────────────────────────────────────────────────

type ChainStep = [string, unknown[]];

function createLocatorProxy(realPage: Page, chain: ChainStep[]): Locator {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "__aymeAdapter") return true;
      if (prop === "_apiName") return "Locator";
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
            async ({ chain: c }) => {
              let current: any = (window as any).__aymeAdapterPage;
              for (const [m, a] of c) current = current[m](...a);
              return (await current.all()).length;
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

      // Playwright's locator matchers call the private-shaped `_expect`
      // protocol. Route that protocol to LocatorImpl so the pinned
      // InjectedScript computes the matcher result, rather than allowing the
      // Node driver to inspect the locator.
      if (prop === "_expect") {
        return async (expression: string, options: Record<string, unknown>) =>
          realPage.evaluate(
            ({ chain: c, expression: e, options: o }) => {
              let current: any = (window as any).__aymeAdapterPage;
              for (const [method, args] of c)
                current = current[method](...args);
              return current._expect(e, o);
            },
            {
              chain,
              expression,
              // AbortSignal is a client-side control object, not serializable.
              options: serializableExpectationOptions(options),
            }
          );
      }

      // The production Locator receives a function already in the browser
      // runtime. Reconstruct the Node callback only at this fixture boundary.
      if (prop === "evaluate" || prop === "evaluateAll") {
        return async (pageFunction: unknown, arg?: unknown) =>
          realPage.evaluate(
            ({ chain: c, method, expression, arg: a }) => {
              let current: any = (window as any).__aymeAdapterPage;
              for (const [chainMethod, chainArgs] of c)
                current = current[chainMethod](...chainArgs);
              const callback = (0, eval)(`(${expression})`);
              return current[method](callback, a);
            },
            {
              chain,
              method: prop,
              expression: String(pageFunction),
              arg,
            }
          );
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

function serializableExpectationOptions(options: Record<string, unknown>) {
  const { signal: _signal, ...serializable } = options;
  return serializable;
}
