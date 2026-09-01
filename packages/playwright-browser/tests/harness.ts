import { fileURLToPath } from "node:url";

import type { Page as PlaywrightPage } from "@playwright/test";
import { build } from "vite";

import type { BrowserPage } from "@ayme-dev/playwright-browser";

import { chromiumViewport, parityDocument } from "./fixtures/document";

export type BrowserPageOperation<TResult> = (
  page: BrowserPage
) => TResult | Promise<TResult>;

export type ChromiumHarness = {
  page: PlaywrightPage;
  reset(document?: string): Promise<void>;
  run<TResult>(operation: BrowserPageOperation<TResult>): Promise<TResult>;
};

type BrowserPageRuntime = {
  page: BrowserPage;
};

type RuntimeWindow = Window & {
  __AYME_CREATE_BROWSER_PAGE__?: () => BrowserPageRuntime;
};

let browserRuntimeSourcePromise: Promise<string> | undefined;

export async function createChromiumHarness(
  page: PlaywrightPage,
  options: { document?: string } = {}
): Promise<ChromiumHarness> {
  const reset = async (document = options.document ?? parityDocument) => {
    await page.setViewportSize(chromiumViewport);
    await page.setContent(document, { waitUntil: "domcontentloaded" });
    await installBrowserPageRuntime(page);
  };

  await reset();

  return {
    page,
    reset,
    run: (operation) => runBrowserPage(page, operation),
  };
}

export async function installBrowserPageRuntime(page: PlaywrightPage) {
  await page.addScriptTag({
    content: await browserRuntimeSource(),
    type: "module",
  });
  await page.waitForFunction(
    () =>
      typeof (window as RuntimeWindow).__AYME_CREATE_BROWSER_PAGE__ ===
      "function"
  );
}

export function runBrowserPage<TResult>(
  page: PlaywrightPage,
  operation: BrowserPageOperation<TResult>
) {
  return page.evaluate(async (operationSource) => {
    const createBrowserPage = (window as RuntimeWindow)
      .__AYME_CREATE_BROWSER_PAGE__;
    if (!createBrowserPage) {
      throw new Error("The BrowserPage runtime is not installed.");
    }

    const operation = Function(
      `return (${operationSource});`
    )() as BrowserPageOperation<TResult>;
    return await operation(createBrowserPage().page);
  }, operation.toString());
}

async function browserRuntimeSource() {
  browserRuntimeSourcePromise ??= buildPublicBrowserEntry();

  return browserRuntimeSourcePromise;
}

async function buildPublicBrowserEntry() {
  const virtualEntry = "\0ayme-playwright-browser-parity-entry";
  const publicEntry = fileURLToPath(
    new URL("../src/index.ts", import.meta.url)
  );
  const result = await build({
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "ayme-playwright-browser-parity-entry",
        load(id) {
          if (id !== virtualEntry) return null;
          return `import { createBrowserPage } from ${JSON.stringify(publicEntry)};
window.__AYME_CREATE_BROWSER_PAGE__ = createBrowserPage;`;
        },
        resolveId(id) {
          return id === virtualEntry ? virtualEntry : null;
        },
      },
    ],
    build: {
      minify: false,
      rollupOptions: { input: virtualEntry },
      write: false,
    },
  });
  const outputs = Array.isArray(result)
    ? result.flatMap((item) => item.output)
    : "output" in result
      ? result.output
      : [];
  const chunk = outputs.find((output) => output.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("The BrowserPage bundle did not produce a chunk.");
  return chunk.code;
}
