/**
 * Guard tests that verify the fixture routes compatibility calls
 * through the Ayme in-browser adapter, not the real Playwright driver.
 *
 * These tests would fail if the proxy was accidentally removed and
 * the real Playwright page/locator was passed through instead.
 */
import { test, expect, DRIVER_ALLOWLIST } from "./pageTest";
import { harnessUnsupportedReason } from "./adapter-bridge";

// ── Proxy presence ──────────────────────────────────────────────────

test("page fixture is the adapter proxy", async ({ page }) => {
  expect((page as any).__aymeAdapter).toBe(true);
});

test("page.locator returns an adapter proxy locator", async ({ page }) => {
  await page.setContent("<div></div>");
  const locator = page.locator("div");
  expect((locator as any).__aymeAdapter).toBe(true);
});

// ── Adapter routing works ───────────────────────────────────────────

test("adapter locator.click reaches the DOM", async ({ page }) => {
  await page.setContent(`
    <button>Click me</button>
    <script>
      document.querySelector('button').addEventListener('click', () => {
        document.title = 'adapter-click';
      });
    </script>
  `);

  await page.locator("button").click();

  // evaluate is in the driver allowlist — reads the actual DOM state
  const title = await page.evaluate(() => document.title);
  expect(title).toBe("adapter-click");
});

test("adapter locator.fill reaches the DOM", async ({ page }) => {
  await page.setContent(`<input type="text" />`);

  await page.locator("input").fill("hello");

  const value = await page.evaluate(
    () => (document.querySelector("input") as HTMLInputElement).value
  );
  expect(value).toBe("hello");
});

test("adapter locator.count works through the bridge", async ({ page }) => {
  await page.setContent("<ul><li>A</li><li>B</li><li>C</li></ul>");
  const count = await page.locator("li").count();
  expect(count).toBe(3);
});

// ── False-green prevention: allowlist audit ─────────────────────────

test("removed compatibility targets are not in the allowlist", () => {
  const mustNotBeAllowlisted = [
    "screenshot",
    "frame",
    "frames",
    "mainFrame",
    "waitForFunction",
    "waitForRequest",
    "waitForResponse",
    "url",
    "title",
    "content",
    "close",
    "on",
    "off",
    "once",
    "waitForEvent",
    "setDefaultTimeout",
    "setDefaultNavigationTimeout",
    "reload",
    "keyboard",
    "mouse",
    "touchscreen",
  ];

  for (const method of mustNotBeAllowlisted) {
    expect(
      DRIVER_ALLOWLIST.has(method),
      `"${method}" must not be in DRIVER_ALLOWLIST — it is a compatibility target tested by upstream specs`
    ).toBe(false);
  }
});

// ── False-green prevention: special-case classification ─────────────

test("page-basic is flagged as mixed-subject suite", () => {
  const reason = harnessUnsupportedReason("page-basic.spec.ts");
  expect(reason).not.toBeNull();
  expect(reason).toContain("mixed-subject");
});

test("page-aria-snapshot is not flagged (real InjectedScript in bridge)", () => {
  expect(harnessUnsupportedReason("page-aria-snapshot.spec.ts")).toBeNull();
});

test("page-aria-snapshot-ai is not flagged (real InjectedScript in bridge)", () => {
  expect(harnessUnsupportedReason("page-aria-snapshot-ai.spec.ts")).toBeNull();
});

// ── False-green prevention: ordinary single-subject detection ───────

test("page-goto is flagged via allowlist overlap", () => {
  const reason = harnessUnsupportedReason("page-goto.spec.ts");
  expect(reason).not.toBeNull();
  expect(reason).toContain("goto");
});

test("page-set-content is flagged via allowlist overlap", () => {
  const reason = harnessUnsupportedReason("page-set-content.spec.ts");
  expect(reason).not.toBeNull();
  expect(reason).toContain("setContent");
});

test("page-wait-for-function is flagged for serialization limitation", () => {
  const reason = harnessUnsupportedReason("page-wait-for-function.spec.ts");
  expect(reason).not.toBeNull();
  expect(reason).toContain("serialize");
});

test("locator specs are never flagged", () => {
  expect(harnessUnsupportedReason("locator-click.spec.ts")).toBeNull();
  expect(harnessUnsupportedReason("selectors-get-by.spec.ts")).toBeNull();
  expect(harnessUnsupportedReason("retarget.spec.ts")).toBeNull();
});
