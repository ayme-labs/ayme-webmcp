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

import {
  errors as playwrightErrors,
  type Locator,
  type Page,
} from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER_DIST_PATH = resolve(__dirname, "../../dist/index.mjs");
const LOCATOR_CHAIN_PAYLOAD = "__aymeLocatorChain";

type ChainStep = [string, unknown[]];

// Kept exclusively in the Node fixture. Browser Locator objects never need a
// serialization format in production; this only gets proxy chains across the
// fixture's realPage.evaluate boundary.
const locatorProxyChains = new WeakMap<object, ChainStep[]>();

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

function encodeBridgeValue(
  value: unknown,
  seen = new WeakMap<object, unknown>()
): unknown {
  if (typeof value === "function")
    throw new TypeError(
      "The upstream adapter bridge does not support nested function arguments or event callbacks."
    );
  if (!value || typeof value !== "object") return value;

  const locatorChain = locatorProxyChains.get(value);
  if (locatorChain)
    return { [LOCATOR_CHAIN_PAYLOAD]: encodeBridgeValue(locatorChain, seen) };

  const previous = seen.get(value);
  if (previous !== undefined) return previous;

  if (Array.isArray(value)) {
    const encoded: unknown[] = [];
    seen.set(value, encoded);
    for (const item of value) encoded.push(encodeBridgeValue(item, seen));
    return encoded;
  }

  // Playwright transports regular expressions in locator options. Browser
  // handles, frames, and other live driver objects are deliberately excluded:
  // this single-document adapter cannot make their identity meaningful.
  if (value instanceof RegExp) return value;
  if (!isPlainObject(value))
    throw new TypeError(
      "The upstream adapter bridge does not support handles, frames, or non-plain object arguments."
    );
  const encoded: Record<string, unknown> = {};
  seen.set(value, encoded);
  for (const [key, item] of Object.entries(value))
    encoded[key] = encodeBridgeValue(item, seen);
  return encoded;
}

function callbackSource(callback: unknown, operation: string): string {
  if (typeof callback !== "function")
    throw new TypeError(
      `${operation} requires a function callback in the upstream adapter bridge.`
    );
  return String(callback);
}

type BridgeEnvelope<Result> =
  | { kind: "value"; value: Result }
  | { kind: "adapter-timeout"; message: string };

function unwrapBridgeEnvelope<Result>(
  envelope: BridgeEnvelope<Result>
): Result {
  if (
    envelope.kind === "adapter-timeout" &&
    typeof envelope.message === "string"
  )
    throw new playwrightErrors.TimeoutError(envelope.message);
  return envelope.value;
}

async function evaluateAdapter<Result>(
  realPage: Page,
  pageFunction: unknown,
  arg: unknown
): Promise<Result> {
  return unwrapBridgeEnvelope(
    await (
      realPage.evaluate as (
        callback: unknown,
        argument: unknown
      ) => Promise<BridgeEnvelope<Result>>
    )(pageFunction, arg)
  );
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

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
    host.__aymeInvokeAdapter = async function invoke(operation: () => any) {
      try {
        return { kind: "value", value: await operation() };
      } catch (error) {
        // Symbols do not cross the browser evaluation boundary. Preserve only
        // the adapter's stable timeout identity in a fixture-private sentinel;
        // all other errors continue through Playwright unchanged.
        if (
          typeof error === "object" &&
          error !== null &&
          (error as Record<symbol, unknown>)[
            Symbol.for("ayme:playwright-browser:TimeoutError")
          ] === true
        )
          return {
            kind: "adapter-timeout",
            message: error instanceof Error ? error.message : String(error),
          };
        throw error;
      }
    };
    host.__aymeDecodeBridgeValue = function decode(value: any): any {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(decode);
      if (Array.isArray(value.__aymeLocatorChain))
        return host.__aymeReplayAdapterChain(value.__aymeLocatorChain);
      if (Object.getPrototypeOf(value) !== Object.prototype) return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, decode(item)])
      );
    };
    host.__aymeReplayAdapterChain = function replay(chain: any[]): any {
      let current: any = host.__aymeAdapterPage;
      for (const [method, args] of chain)
        current = current[method](...host.__aymeDecodeBridgeValue(args));
      return current;
    };
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

      // Locator-creating: return proxy locator.
      if (LOCATOR_CREATING_METHODS.has(prop)) {
        return (...args: unknown[]) =>
          createLocatorProxy(realPage, [[prop, args]]);
      }

      // ── Callback transport ─────────────────────────────────────────
      // Functions cannot cross realPage.evaluate. Reconstruct the selected
      // upstream callback shape in the browser, then invoke PageImpl's public
      // API. Production PageImpl receives the callback directly.

      if (prop === "evaluate") {
        return async (pageFunction: unknown, arg?: unknown) =>
          evaluateAdapter(
            realPage,
            ({ expression, isFunction, arg: a }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(() => {
                const callback = isFunction
                  ? (0, eval)(`(${expression})`)
                  : expression;
                return host.__aymeAdapterPage.evaluate(
                  callback,
                  host.__aymeDecodeBridgeValue(a)
                );
              });
            },
            {
              expression: String(pageFunction),
              isFunction: typeof pageFunction === "function",
              arg: encodeBridgeValue(arg),
            }
          );
      }

      if (prop === "waitForFunction") {
        return async (
          pageFunction: unknown,
          arg?: unknown,
          options?: unknown
        ) => {
          // Resolve the browser handle to its JSON value. A minimal Node-side
          // handle preserves the subset used by the pinned selected specs.
          const result = await evaluateAdapter(
            realPage,
            ({ expression, isFunction, arg: a, options: opts }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(async () => {
                const callback = isFunction
                  ? (0, eval)(`(${expression})`)
                  : expression;
                const handle = await host.__aymeAdapterPage.waitForFunction(
                  callback,
                  host.__aymeDecodeBridgeValue(a),
                  host.__aymeDecodeBridgeValue(opts)
                );
                return handle.jsonValue();
              });
            },
            {
              expression: String(pageFunction),
              isFunction: typeof pageFunction === "function",
              arg: encodeBridgeValue(arg),
              options: encodeBridgeValue(options) as Record<string, unknown>,
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
          evaluateAdapter(
            realPage,
            ({ html: h, options: o }: { html: string; options: unknown }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(() =>
                host.__aymeAdapterPage.setContent(
                  h,
                  host.__aymeDecodeBridgeValue(o)
                )
              );
            },
            {
              html,
              options: encodeBridgeValue(options),
            }
          );
      }

      // Page.$eval/$$eval callbacks are reconstructed only at this fixture
      // boundary, then passed to the adapter's public browser-native methods.
      if (prop === "$eval" || prop === "$$eval") {
        return async (selector: string, pageFunction: unknown, arg?: unknown) =>
          evaluateAdapter(
            realPage,
            ({ method, selector: s, expression, arg: a }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(() =>
                host.__aymeAdapterPage[method](
                  s,
                  (0, eval)(`(${expression})`),
                  host.__aymeDecodeBridgeValue(a)
                )
              );
            },
            {
              method: prop,
              selector,
              expression: callbackSource(pageFunction, `Page.${prop}`),
              arg: encodeBridgeValue(arg),
            }
          );
      }

      // Everything else: route through the adapter page in the browser.
      // Both method calls and property accesses go through the adapter
      // so that unsupported members (keyboard, mouse, touchscreen, etc.)
      // are never leaked from the real Playwright driver.
      return async (...args: unknown[]) =>
        evaluateAdapter(
          realPage,
          ({ member, args: a }) => {
            const host = window as any;
            return host.__aymeInvokeAdapter(() => {
              const p = host.__aymeAdapterPage;
              const v = p[member];
              const args = host.__aymeDecodeBridgeValue(a);
              if (typeof v === "function") return v.call(p, ...args);
              if (a.length === 0 && v !== undefined) return v;
              throw new TypeError(
                `__aymeAdapterPage.${member} is not a function`
              );
            });
          },
          { member: prop, args: encodeBridgeValue(args) as any[] }
        );
    },
  }) as Page;
}

// ── Locator proxy ───────────────────────────────────────────────────

function createLocatorProxy(
  realPage: Page,
  chain: ChainStep[],
  description?: string
): Locator {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "__aymeAdapter") return true;
      if (prop === "_apiName") return "Locator";
      if (prop === "then") return undefined;

      if (prop === "description") return () => description ?? null;
      if (prop === "toString") {
        return () => {
          if (description) return description;
          const [method, args] = chain[0] ?? [];
          if (method === "getByRole") {
            const [role, options] = args as [string, { name?: string }?];
            return options?.name === undefined
              ? `getByRole('${role}')`
              : `getByRole('${role}', { name: '${options.name}' })`;
          }
          if (method === "locator") return `locator('${args[0]}')`;
          return "locator(...)";
        };
      }

      if (prop === "describe") {
        return (nextDescription: string) =>
          createLocatorProxy(
            realPage,
            [...chain, ["describe", [nextDescription]]],
            nextDescription
          );
      }

      // Chain methods (including first/last): extend the chain and let
      // the actual adapter determine support/behavior.
      if (LOCATOR_CHAIN_METHODS.has(prop as string)) {
        return (...args: unknown[]) =>
          createLocatorProxy(realPage, [...chain, [prop as string, args]]);
      }

      // all(): returns array of proxy locators by index.
      if (prop === "all") {
        return async () => {
          const count: number = await evaluateAdapter(
            realPage,
            async ({ chain: c }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(async () => {
                const current: any = host.__aymeReplayAdapterChain(c);
                return (await current.all()).length;
              });
            },
            { chain: encodeBridgeValue(chain) }
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
          evaluateAdapter(
            realPage,
            ({ chain: c, expression: e, options: o }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(() => {
                const current: any = host.__aymeReplayAdapterChain(c);
                return current._expect(e, host.__aymeDecodeBridgeValue(o));
              });
            },
            {
              chain: encodeBridgeValue(chain),
              expression,
              // AbortSignal is a client-side control object, not serializable.
              options: serializableExpectationOptions(
                encodeBridgeValue(options) as Record<string, unknown>
              ),
            }
          );
      }

      // The production Locator receives a function already in the browser
      // runtime. Reconstruct the Node callback only at this fixture boundary.
      if (prop === "evaluate" || prop === "evaluateAll") {
        return async (
          pageFunction: unknown,
          arg?: unknown,
          options?: unknown
        ) =>
          evaluateAdapter(
            realPage,
            ({ chain: c, method, expression, arg: a, options: o }) => {
              const host = window as any;
              return host.__aymeInvokeAdapter(() => {
                const current: any = host.__aymeReplayAdapterChain(c);
                return current[method](
                  (0, eval)(`(${expression})`),
                  host.__aymeDecodeBridgeValue(a),
                  host.__aymeDecodeBridgeValue(o)
                );
              });
            },
            {
              chain: encodeBridgeValue(chain),
              method: prop,
              expression: callbackSource(pageFunction, `Locator.${prop}`),
              arg: encodeBridgeValue(arg),
              options: serializableQueryOptions(encodeBridgeValue(options)),
            }
          );
      }

      // Everything else: terminal evaluation in browser.
      return async (...args: unknown[]) =>
        evaluateAdapter(
          realPage,
          ({ chain: c, method, args: a }) => {
            const host = window as any;
            return host.__aymeInvokeAdapter(() => {
              const current: any = host.__aymeReplayAdapterChain(c);
              return current[method](...host.__aymeDecodeBridgeValue(a));
            });
          },
          {
            chain: encodeBridgeValue(chain),
            method: prop as string,
            args: encodeBridgeValue(args) as any[],
          }
        );
    },
  };
  const proxy = new Proxy({}, handler);
  locatorProxyChains.set(proxy, chain);
  return proxy as unknown as Locator;
}

function serializableExpectationOptions(options: Record<string, unknown>) {
  const { signal: _signal, ...serializable } = options;
  return serializable;
}

function serializableQueryOptions(options: unknown) {
  if (!options || typeof options !== "object") return options;
  const { signal: _signal, ...serializable } = options as Record<
    string,
    unknown
  >;
  return serializable;
}
