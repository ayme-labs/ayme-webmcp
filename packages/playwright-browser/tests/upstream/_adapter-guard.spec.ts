/**
 * Guard tests that verify the fixture routes compatibility calls
 * through the Ayme in-browser adapter, not the real Playwright driver.
 *
 * These tests would fail if the proxy was accidentally removed and
 * the real Playwright page/locator was passed through instead.
 *
 * Infrastructure operations (setContent, evaluate) use the real
 * Playwright page directly; only the adapter proxy is tested.
 */
import { test as base, expect } from "@playwright/test";
import { createAdapterPage } from "./adapter-bridge";

const test = base.extend<{ adapterPage: import("@playwright/test").Page }>({
  adapterPage: async ({ page }, use) => {
    const proxy = await createAdapterPage(page);
    await use(proxy);
  },
});

// ── Proxy presence ──────────────────────────────────────────────────

test("execution evidence records browser method entry and swallowed dispatch failures", async ({page, adapterPage}) => {
  await adapterPage.setContent("<button>hello</button>");
  await adapterPage.locator("button").count();
  await adapterPage.goto("about:blank").catch(() => {});
  const execution = await page.evaluate(() => (window as any).__aymeEvidence);
  expect(execution.entered).toContain("Page.setContent");
  expect(execution.entered).toContain("Locator.count");
  expect(execution.entered).not.toContain("Page.goto");
  expect((page as any).__aymeTransportFailures.length).toBeGreaterThan(0);
});

test("page fixture is the adapter proxy", async ({ adapterPage }) => {
  expect((adapterPage as any).__aymeAdapter).toBe(true);
});

test("page.locator returns an adapter proxy locator", async ({
  page,
  adapterPage,
}) => {
  await page.setContent("<div></div>");
  const locator = adapterPage.locator("div");
  expect((locator as any).__aymeAdapter).toBe(true);
});

// ── Adapter routing works ───────────────────────────────────────────

test("adapter locator.click reaches the DOM", async ({
  page,
  adapterPage,
}) => {
  await page.setContent(`
    <button>Click me</button>
    <script>
      document.querySelector('button').addEventListener('click', () => {
        document.title = 'adapter-click';
      });
    </script>
  `);

  await adapterPage.locator("button").click();

  const title = await page.evaluate(() => document.title);
  expect(title).toBe("adapter-click");
});

test("adapter locator.fill reaches the DOM", async ({
  page,
  adapterPage,
}) => {
  await page.setContent(`<input type="text" />`);

  await adapterPage.locator("input").fill("hello");

  const value = await page.evaluate(
    () => (document.querySelector("input") as HTMLInputElement).value,
  );
  expect(value).toBe("hello");
});

test("adapter locator.count works through the bridge", async ({
  page,
  adapterPage,
}) => {
  await page.setContent("<ul><li>A</li><li>B</li><li>C</li></ul>");
  const count = await adapterPage.locator("li").count();
  expect(count).toBe(3);
});

test("adapter locator matchers use pinned InjectedScript semantics", async ({
  page,
  adapterPage,
}) => {
  await page.setContent(`
    <p class="message">Hello <strong>adapter</strong></p>
    <p class="message" hidden>Hidden</p>
  `);

  await expect(adapterPage.locator("p.message").first()).toHaveText(
    "Hello adapter"
  );
  await expect(adapterPage.locator("p.message")).toHaveCount(2);
  await expect(adapterPage.locator("p.message").first()).toBeVisible();
  await expect(adapterPage.locator("p.message").last()).toBeHidden();

  const execution = await page.evaluate(() => (window as any).__aymeEvidence);
  expect(execution.entered).toContain("Locator._expect");
});

test("adapter locator callbacks serialize arguments and execute in the adapter", async ({
  page,
  adapterPage,
}) => {
  await page.setContent("<ul><li>A</li><li>B</li></ul>");

  const one = await adapterPage.locator("li").first().evaluate(
    (element, suffix) => element.textContent + suffix,
    "!"
  );
  const all = await adapterPage.locator("li").evaluateAll(
    (elements, payload) =>
      elements.map(
        element =>
          payload.prefix +
          element.textContent +
          `:${payload.optional === undefined}:${Number.isNaN(payload.nan)}`
      ),
    { prefix: "item:", optional: undefined, nan: Number.NaN }
  );

  expect(one).toBe("A!");
  expect(all).toEqual(["item:A:true:true", "item:B:true:true"]);
  const execution = await page.evaluate(() => (window as any).__aymeEvidence);
  expect(execution.entered).toContain("Locator.evaluate");
  expect(execution.entered).toContain("Locator._evaluateAllExpression");
});

// ── False-green prevention: proxy does not leak to real driver ──────

test("proxy page methods do not fall through to real Playwright driver", async ({
  adapterPage,
}) => {
  // Methods that the adapter does NOT support must throw through the proxy.
  // setContent, evaluate, and waitForFunction are now routed through the
  // adapter bridge (W-27), so they should succeed — only truly unsupported
  // driver methods throw here.
  await expect(
    (adapterPage as any).goto("about:blank"),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).waitForTimeout(0),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).route("**/*", () => {}),
  ).rejects.toThrow();
});

// ── W-27: setContent through the adapter bridge ────────────────────

test("adapter setContent replaces document content", async ({
  page,
  adapterPage,
}) => {
  await (adapterPage as any).setContent("<h1>Adapted</h1>");
  const text = await page.evaluate(
    () => document.querySelector("h1")?.textContent
  );
  expect(text).toBe("Adapted");
});

test("adapter setContent with domcontentloaded waitUntil", async ({
  adapterPage,
}) => {
  await (adapterPage as any).setContent("<p>loaded</p>", {
    waitUntil: "domcontentloaded",
  });
  const count = await adapterPage.locator("p").count();
  expect(count).toBe(1);
});

test("adapter setContent with commit resolves immediately", async ({
  adapterPage,
}) => {
  await (adapterPage as any).setContent("<p>committed</p>", {
    waitUntil: "commit",
  });
  const count = await adapterPage.locator("p").count();
  expect(count).toBe(1);
});

// ── W-27: evaluate through the adapter bridge ──────────────────────

test("adapter evaluate runs a function and returns result", async ({
  adapterPage,
}) => {
  const result = await (adapterPage as any).evaluate(() => 2 + 3);
  expect(result).toBe(5);
});

test("adapter evaluate passes arg to function", async ({ adapterPage }) => {
  const result = await (adapterPage as any).evaluate(
    (n: number) => n * 4,
    7
  );
  expect(result).toBe(28);
});

test("adapter evaluate handles string expressions", async ({
  adapterPage,
}) => {
  const result = await (adapterPage as any).evaluate("1 + 1");
  expect(result).toBe(2);
});

test("adapter evaluate propagates errors without retry", async ({
  adapterPage,
}) => {
  await expect(
    (adapterPage as any).evaluate(() => {
      throw new Error("eval-boom");
    })
  ).rejects.toThrow(/eval-boom/);
});

test("adapter evaluate can mutate the DOM", async ({
  page,
  adapterPage,
}) => {
  await page.setContent('<div id="mut">before</div>');
  await (adapterPage as any).evaluate(() => {
    document.getElementById("mut")!.textContent = "after";
  });
  const text = await page.evaluate(
    () => document.getElementById("mut")?.textContent
  );
  expect(text).toBe("after");
});

// ── W-27: waitForFunction through the adapter bridge ───────────────

test("adapter waitForFunction resolves with handle.jsonValue()", async ({
  adapterPage,
}) => {
  const handle = await (adapterPage as any).waitForFunction(() => 42);
  expect(await handle.jsonValue()).toBe(42);
});

test("adapter waitForFunction false predicate times out", async ({
  adapterPage,
}) => {
  await expect(
    (adapterPage as any).waitForFunction(() => false, {}, {
      polling: 10,
      timeout: 100,
    })
  ).rejects.toThrow(/[Tt]imeout/);
});

test("adapter waitForFunction string expression works", async ({
  page,
  adapterPage,
}) => {
  // Set a window variable, then wait for it via string expression.
  // The expression returns the variable itself (truthy when > 0).
  await page.evaluate(() => {
    (window as any).__testVar = 0;
    setTimeout(() => {
      (window as any).__testVar = 99;
    }, 50);
  });
  const handle = await (adapterPage as any).waitForFunction(
    "window.__testVar || 0",
    {},
    { polling: 10, timeout: 5000 }
  );
  expect(await handle.jsonValue()).toBe(99);
});

test("adapter waitForFunction callback side effects stop after resolve", async ({
  page,
  adapterPage,
}) => {
  // Set a counter that the predicate increments each poll.
  await page.evaluate(() => {
    (window as any).__sideEffectCounter = 0;
  });
  const handle = await (adapterPage as any).waitForFunction(
    () => {
      (window as any).__sideEffectCounter++;
      return (window as any).__sideEffectCounter >= 3
        ? (window as any).__sideEffectCounter
        : 0;
    },
    {},
    { polling: 10 }
  );
  const resolvedAt = await handle.jsonValue();
  expect(resolvedAt).toBeGreaterThanOrEqual(3);

  // Wait — counter should NOT keep incrementing.
  await page.waitForTimeout(200);
  const after = await page.evaluate(
    () => (window as any).__sideEffectCounter
  );
  expect(after).toBe(resolvedAt);
});

test("adapter waitForFunction propagates thrown error", async ({
  adapterPage,
}) => {
  await expect(
    (adapterPage as any).waitForFunction(() => {
      throw new Error("predicate-boom");
    })
  ).rejects.toThrow(/predicate-boom/);
});

test("adapter waitForFunction handle.dispose() returns a promise", async ({
  adapterPage,
}) => {
  const handle = await (adapterPage as any).waitForFunction(() => 1);
  const result = handle.dispose();
  expect(result).toBeInstanceOf(Promise);
  await result;
});

// ── Proxy isolation ─────────────────────────────────────────────────

test("proxy does not expose real driver sub-objects", async ({
  page,
  adapterPage,
}) => {
  // keyboard, mouse, and touchscreen are object properties on the real
  // Playwright page. The proxy must not leak them.

  // The proxy returns a function (adapter routing), not the real object.
  const proxyKbd = (adapterPage as any).keyboard;
  const proxyMouse = (adapterPage as any).mouse;
  const proxyTouch = (adapterPage as any).touchscreen;

  expect(proxyKbd).not.toBe(page.keyboard);
  expect(proxyMouse).not.toBe(page.mouse);
  expect(proxyTouch).not.toBe(page.touchscreen);

  // The real driver sub-objects have callable API methods (press, click,
  // tap). Through the adapter proxy these must be undefined or throw.
  await expect(
    (adapterPage as any).keyboard("press", "a"),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).mouse("click", 0, 0),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).touchscreen("tap", 0, 0),
  ).rejects.toThrow();
});
