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

// ── False-green prevention: proxy does not leak to real driver ──────

test("proxy page methods do not fall through to real Playwright driver", async ({
  adapterPage,
}) => {
  // Use arguments that would SUCCEED on the real Playwright page so a
  // leaked driver call would pass silently. Through the adapter these
  // must all throw.
  await expect(
    (adapterPage as any).goto("about:blank"),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).setContent("<div>ok</div>"),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).evaluate(() => 1 + 1),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).waitForTimeout(0),
  ).rejects.toThrow();

  await expect(
    (adapterPage as any).route("**/*", () => {}),
  ).rejects.toThrow();
});

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
