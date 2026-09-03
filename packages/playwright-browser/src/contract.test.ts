/* eslint-disable @typescript-eslint/no-explicit-any -- intentional casts to test runtime validation */
import { describe, expect, it, afterEach } from "vitest";

import {
  createPage,
  isAymeLocator,
  LOCATOR_BRAND,
  resolveLocatorElements,
} from "./index";
import { AdapterJSHandle, PageImpl } from "./page";

describe("Single-document adapter contract", () => {
  // ── AC1: createPage targets only the current Window ────────────

  it("createPage uses the current window without an alternate-window option", () => {
    const page = createPage();
    expect(page).toBeDefined();
    expect(page.locator("body")).toBeDefined();
  });

  // ── AC2: filter serialization (JSON.stringify) ────────────────

  describe("filter", () => {
    it("preserves an empty filter without corrupting the selector", async () => {
      document.body.innerHTML = "<div><span>A</span></div>";
      const page = createPage();
      const base = page.locator("div");
      const filtered = base.filter({});
      expect(await filtered.count()).toBe(1);
    });

    it("serializes has with JSON.stringify quoting", async () => {
      document.body.innerHTML = `
        <div><span class="inner">match</span></div>
        <div><span class="other">no-match</span></div>
      `;
      const page = createPage();
      const inner = page.locator("span.inner");
      const filtered = page.locator("div").filter({ has: inner });
      expect(await filtered.count()).toBe(1);
    });

    it("serializes hasNot with JSON.stringify quoting", async () => {
      document.body.innerHTML = `
        <div><span class="exclude">excluded</span></div>
        <div><span class="keep">kept</span></div>
      `;
      const page = createPage();
      const exclude = page.locator("span.exclude");
      const filtered = page.locator("div").filter({ hasNot: exclude });
      expect(await filtered.count()).toBe(1);
    });

    it("supports visible filter option", async () => {
      document.body.innerHTML = `
        <div style="display:none">hidden</div>
        <div>visible</div>
      `;
      const page = createPage();
      const visible = page.locator("div").filter({ visible: true });
      expect(await visible.count()).toBe(1);
    });

    it("rejects a cross-page locator in has", () => {
      const page1 = createPage();
      const page2 = createPage();
      const loc2 = page2.locator("div");
      expect(() => page1.locator("div").filter({ has: loc2 })).toThrow(
        /same frame/
      );
    });

    it("rejects a cross-page locator in hasNot", () => {
      const page1 = createPage();
      const page2 = createPage();
      const loc2 = page2.locator("div");
      expect(() => page1.locator("div").filter({ hasNot: loc2 })).toThrow(
        /same frame/
      );
    });
  });

  // ── AC2 extension: locator(selector, options) ─────────────────

  describe("locator with options", () => {
    it("Locator.locator accepts LocatorOptions (without visible)", async () => {
      document.body.innerHTML = `
        <ul>
          <li><span>A</span></li>
          <li><span>B</span></li>
        </ul>
      `;
      const page = createPage();
      const items = page.locator("li").locator("span", { hasText: "A" });
      expect(await items.count()).toBe(1);
    });

    it("Page.locator accepts LocatorOptions including visible", async () => {
      document.body.innerHTML = `
        <div style="display:none">hidden</div>
        <div>visible</div>
      `;
      const page = createPage();
      // Playwright types don't expose visible on Page.locator options, but our
      // implementation accepts the full LocatorOptions shape
      const visible = (page as any).locator("div", { visible: true });
      expect(await visible.count()).toBe(1);
    });

    it("Page.locator accepts has/hasNot options", async () => {
      document.body.innerHTML = `
        <div><span>hello</span></div>
        <div><span>world</span></div>
      `;
      const page = createPage();
      const filtered = page.locator("div", { hasText: "hello" });
      expect(await filtered.count()).toBe(1);
    });
  });

  // ── Locator.locator(Locator) with internal:chain ──────────────

  describe("Locator.locator(Locator) via internal:chain", () => {
    it("accepts a locator as first argument", async () => {
      document.body.innerHTML = `
        <div>one <span>two</span> <button>three</button></div>
        <span>four</span>
        <button>five</button>
      `;
      const page = createPage();
      const inner = page.locator("button");
      const chained = page.locator("div").locator(inner);
      expect(await chained.count()).toBe(1);
    });

    it("rejects cross-page locator in Locator.locator()", () => {
      const page1 = createPage();
      const page2 = createPage();
      const loc2 = page2.locator("div");
      expect(() => page1.locator("div").locator(loc2)).toThrow(/same frame/);
    });
  });

  // ── AC3: locator brand (structured payload, no instanceof) ────

  describe("locator brand", () => {
    it("isAymeLocator detects a real locator", () => {
      const page = createPage();
      const loc = page.locator("div");
      expect(isAymeLocator(loc)).toBe(true);
    });

    it("isAymeLocator rejects a plain object", () => {
      expect(isAymeLocator({ selector: "div" })).toBe(false);
    });

    it("isAymeLocator rejects null", () => {
      expect(isAymeLocator(null)).toBe(false);
    });

    it("isAymeLocator rejects a boolean brand (no structured payload)", () => {
      const fake = { [LOCATOR_BRAND]: true };
      expect(isAymeLocator(fake)).toBe(false);
    });

    it("brand payload exposes getSelector and resolveElements", () => {
      document.body.innerHTML = "<div>test</div>";
      const page = createPage();
      const loc = page.locator("div");
      const payload = (loc as any)[LOCATOR_BRAND];
      expect(typeof payload.getSelector).toBe("function");
      expect(typeof payload.resolveElements).toBe("function");
      expect(payload.resolveElements()).toHaveLength(1);
    });

    it("rejects a plain object in filter.has", () => {
      const page = createPage();
      const fakeLocator = { selector: "div" };
      expect(() =>
        page.locator("div").filter({ has: fakeLocator as any })
      ).toThrow(/expected an Ayme Locator/);
    });

    it("skips null/undefined in filter.has (falsy, matches Playwright truthy check)", () => {
      document.body.innerHTML = "<div>ok</div>";
      const page = createPage();
      const loc = page.locator("div").filter({ has: null as any });
      expect(loc).toBeDefined();
    });

    it("rejects a number in filter.hasNot with diagnostic type", () => {
      const page = createPage();
      expect(() => page.locator("div").filter({ hasNot: 42 as any })).toThrow(
        /expected an Ayme Locator.*got number/
      );
    });
  });

  // ── Shared resolver ───────────────────────────────────────────

  describe("shared resolver", () => {
    it("resolveLocatorElements returns matching elements", () => {
      document.body.innerHTML = "<ul><li>A</li><li>B</li></ul>";
      const page = createPage();
      const loc = page.locator("li");
      const elements = resolveLocatorElements(loc);
      expect(elements).toHaveLength(2);
    });

    it("resolveLocatorElements throws for non-locator", () => {
      expect(() => resolveLocatorElements({})).toThrow(
        /expected an Ayme Locator/
      );
    });

    it("resolveLocatorElements throws for null", () => {
      expect(() => resolveLocatorElements(null)).toThrow(
        /expected an Ayme Locator.*got null/
      );
    });
  });

  // ── AC4: unsupported options rejection ────────────────────────

  describe("unsupported options", () => {
    it("click rejects unsupported options", async () => {
      document.body.innerHTML = "<button>ok</button>";
      const page = createPage();
      await expect(
        page.locator("button").click({ force: true } as any)
      ).rejects.toThrow(/unsupported options.*force/);
    });

    it("fill rejects unsupported options", async () => {
      document.body.innerHTML = '<input type="text" />';
      const page = createPage();
      await expect(
        page.locator("input").fill("x", { timeout: 1000 } as any)
      ).rejects.toThrow(/unsupported options.*timeout/);
    });

    it("press rejects unsupported options", async () => {
      document.body.innerHTML = '<input type="text" />';
      const page = createPage();
      await expect(
        page.locator("input").press("a", { delay: 100 } as any)
      ).rejects.toThrow(/unsupported options.*delay/);
    });

    it("waitFor rejects attached state", async () => {
      document.body.innerHTML = "<div>visible</div>";
      const page = createPage();
      await expect(
        page.locator("div").waitFor({ state: "attached" } as any)
      ).rejects.toThrow(/state "attached" is not supported/);
    });

    it("waitFor rejects detached state", async () => {
      document.body.innerHTML = "<div>visible</div>";
      const page = createPage();
      await expect(
        page.locator("div").waitFor({ state: "detached" } as any)
      ).rejects.toThrow(/state "detached" is not supported/);
    });

    it("click succeeds without options", async () => {
      document.body.innerHTML = "<button>ok</button>";
      const page = createPage();
      await page.locator("button").click();
    });

    it("waitFor defaults to visible state", async () => {
      document.body.innerHTML = "<div>visible</div>";
      const page = createPage();
      await page.locator("div").waitFor();
    });

    it("waitFor succeeds with supported options only", async () => {
      document.body.innerHTML = "<div>visible</div>";
      const page = createPage();
      await page.locator("div").waitFor({ state: "visible", timeout: 1000 });
    });
  });

  // ── AC5: resolveOne removed ───────────────────────────────────

  it("page does not expose resolveOne", () => {
    const page = createPage();
    expect((page as any).resolveOne).toBeUndefined();
  });

  // ── getByRole full options ────────────────────────────────────

  describe("getByRole options", () => {
    it("supports name option", async () => {
      document.body.innerHTML = `
        <button>Save</button>
        <button>Cancel</button>
      `;
      const page = createPage();
      const save = page.getByRole("button", { name: "Save" });
      expect(await save.count()).toBe(1);
    });

    it("supports checked option", async () => {
      document.body.innerHTML = `
        <input type="checkbox" checked aria-label="agree" />
        <input type="checkbox" aria-label="other" />
      `;
      const page = createPage();
      const checked = page.getByRole("checkbox", { checked: true });
      expect(await checked.count()).toBe(1);
    });

    it("supports description option via aria-describedby", async () => {
      document.body.innerHTML = `
        <button aria-describedby="desc1">OK</button>
        <span id="desc1">Confirms the action</span>
        <button>Cancel</button>
      `;
      const page = createPage();
      const btn = page.getByRole("button", {
        description: "Confirms the action",
      });
      expect(await btn.count()).toBe(1);
    });

    it("Locator.getByRole supports full options including pressed", async () => {
      document.body.innerHTML = `
        <div>
          <button aria-pressed="true">Bold</button>
          <button>Italic</button>
        </div>
      `;
      const page = createPage();
      const pressed = page
        .locator("div")
        .getByRole("button", { pressed: true });
      expect(await pressed.count()).toBe(1);
    });
  });

  // ── first / last / nth ────────────────────────────────────────

  describe("first/last/nth", () => {
    it("first() returns the first match", async () => {
      document.body.innerHTML = "<ul><li>A</li><li>B</li><li>C</li></ul>";
      const page = createPage();
      expect(await page.locator("li").first().count()).toBe(1);
    });

    it("last() returns the last match", async () => {
      document.body.innerHTML = "<ul><li>A</li><li>B</li><li>C</li></ul>";
      const page = createPage();
      expect(await page.locator("li").last().count()).toBe(1);
    });
  });

  // ── W-27: setContent ──────────────────────────────────────────
  // Tests use a dedicated iframe document so document.open/write/close
  // doesn't reload the Vitest host.

  describe("setContent", () => {
    let iframe: HTMLIFrameElement;
    let dedicatedPage: PageImpl;

    function setupDedicatedPage() {
      iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      const win = iframe.contentWindow! as Window & typeof globalThis;
      dedicatedPage = new PageImpl(win);
    }

    afterEach(() => {
      iframe?.remove();
    });

    it("replaces the document with document.open/write/close", async () => {
      setupDedicatedPage();
      await dedicatedPage.setContent("<h1>Hello</h1><p>World</p>");
      expect(dedicatedPage.document.querySelector("h1")?.textContent).toBe(
        "Hello"
      );
      expect(dedicatedPage.document.querySelector("p")?.textContent).toBe(
        "World"
      );
    });

    it("clears previous content", async () => {
      setupDedicatedPage();
      dedicatedPage.document.body.innerHTML = "<div id='old'>old</div>";
      await dedicatedPage.setContent("<span id='new'>new</span>");
      expect(dedicatedPage.document.getElementById("old")).toBeNull();
      expect(dedicatedPage.document.getElementById("new")?.textContent).toBe(
        "new"
      );
    });

    it("accepts waitUntil option without error", async () => {
      setupDedicatedPage();
      await dedicatedPage.setContent("<p>ok</p>", {
        waitUntil: "domcontentloaded",
      });
      expect(dedicatedPage.document.querySelector("p")?.textContent).toBe("ok");
    });

    it("rejects networkidle before mutation", async () => {
      setupDedicatedPage();
      const bodyBefore = dedicatedPage.document.body.innerHTML;
      await expect(
        dedicatedPage.setContent("<p>should not appear</p>", {
          waitUntil: "networkidle",
        })
      ).rejects.toThrow(/networkidle.*not supported/);
      // Body unchanged — rejection happened before mutation.
      expect(dedicatedPage.document.body.innerHTML).toBe(bodyBefore);
    });

    it("rejects invalid waitUntil value", async () => {
      setupDedicatedPage();
      await expect(
        dedicatedPage.setContent("<p>ok</p>", {
          waitUntil: "invalid" as any,
        })
      ).rejects.toThrow(/Unsupported waitUntil/);
    });

    it("commit resolves immediately", async () => {
      setupDedicatedPage();
      await dedicatedPage.setContent("<p>commit</p>", {
        waitUntil: "commit",
      });
      expect(dedicatedPage.document.querySelector("p")?.textContent).toBe(
        "commit"
      );
    });

    it("locators work after setContent replaces the document", async () => {
      setupDedicatedPage();
      await dedicatedPage.setContent('<button role="button">Click me</button>');
      const btn = dedicatedPage.getByRole("button", { name: "Click me" });
      expect(await btn.count()).toBe(1);
    });

    it("setContent with load waits for readyState complete", async () => {
      setupDedicatedPage();
      // Default waitUntil is 'load'; for a simple HTML document the load
      // event fires synchronously after document.close() — setContent
      // should resolve successfully.
      await dedicatedPage.setContent("<div>load-test</div>");
      expect(dedicatedPage.document.querySelector("div")?.textContent).toBe(
        "load-test"
      );
    });

    it("setContent resolves before timeout for simple HTML", async () => {
      setupDedicatedPage();
      // document.close triggers load synchronously for simple HTML,
      // so even with a short timeout the promise should resolve.
      await dedicatedPage.setContent("<p>fast</p>", {
        waitUntil: "load",
        timeout: 5000,
      });
      expect(dedicatedPage.document.querySelector("p")?.textContent).toBe(
        "fast"
      );
    });

    it("re-acquires InjectedScript after replacing the document", async () => {
      setupDedicatedPage();
      // First setContent populates _injected.
      await dedicatedPage.setContent("<div>first</div>");
      expect(dedicatedPage.resolveAll("div").length).toBe(1);
      // Second setContent replaces the DOM — old InjectedScript is stale.
      await dedicatedPage.setContent("<span>second</span>");
      expect(dedicatedPage.resolveAll("span").length).toBe(1);
      expect(dedicatedPage.resolveAll("div").length).toBe(0);
    });
  });

  // ── W-27: evaluate ───────────────────────────────────────────

  describe("evaluate", () => {
    it("evaluates a function and returns its result", async () => {
      const page = createPage();
      const result = await page.evaluate(() => 1 + 2);
      expect(result).toBe(3);
    });

    it("passes arg to the function", async () => {
      const page = createPage();
      const result = await page.evaluate((n: number) => n * 3, 7);
      expect(result).toBe(21);
    });

    it("evaluates a string expression (isFunction=false)", async () => {
      const page = createPage();
      const result = await page.evaluate("1 + 1");
      expect(result).toBe(2);
    });

    it("evaluates a stringified function with arg (isFunction=true via bridge)", async () => {
      const page = createPage();
      const fn = (x: number) => x + 10;
      // Simulate bridge transport: String(fn) + explicit isFunction.
      const result = await (page as any)._evaluateExpression(
        String(fn),
        true,
        5
      );
      expect(result).toBe(15);
    });

    it("string + isFunction=false returns expression value, not function", async () => {
      const page = createPage();
      // '(() => 42)' as a non-function expression evaluates to the
      // function object, but isFunction=false means we return it raw.
      const result = await (page as any)._evaluateExpression("1 + 2", false);
      expect(result).toBe(3);
    });

    it("never retries after runtime exception", async () => {
      const page = createPage();
      await expect(page.evaluate("throw new Error('boom')")).rejects.toThrow(
        "boom"
      );
    });

    it("can read the DOM", async () => {
      document.body.innerHTML = "<div id='target'>hi</div>";
      const page = createPage();
      const text = await page.evaluate(
        () => document.getElementById("target")?.textContent
      );
      expect(text).toBe("hi");
    });

    it("can mutate the DOM", async () => {
      document.body.innerHTML = "<div id='mut'>before</div>";
      const page = createPage();
      await page.evaluate(() => {
        document.getElementById("mut")!.textContent = "after";
      });
      const el = document.getElementById("mut");
      expect(el?.textContent).toBe("after");
    });
  });

  // ── W-27: waitForFunction ─────────────────────────────────────

  describe("waitForFunction", () => {
    it("resolves immediately with AdapterJSHandle", async () => {
      const page = createPage();
      const handle = await (page as any).waitForFunction(() => 42);
      expect(handle).toBeInstanceOf(AdapterJSHandle);
      expect(await handle.jsonValue()).toBe(42);
    });

    it("polls until the predicate becomes truthy", async () => {
      const page = createPage();
      let counter = 0;
      const handle = await (page as any).waitForFunction(
        () => {
          counter++;
          return counter >= 3 ? counter : 0;
        },
        undefined,
        { polling: 10 }
      );
      expect(await handle.jsonValue()).toBeGreaterThanOrEqual(3);
    });

    it("rejects on timeout (including never-settling predicates)", async () => {
      const page = createPage();
      await expect(
        (page as any).waitForFunction(() => false, undefined, {
          polling: 10,
          timeout: 50,
        })
      ).rejects.toThrow(/[Tt]imeout/);
    });

    it("function reference: evals once, calls each poll", async () => {
      const page = createPage();
      let counter = 0;
      const fn = () => {
        counter++;
        return counter >= 2 ? "done" : "";
      };
      const handle = await (page as any).waitForFunction(fn, undefined, {
        polling: 10,
      });
      expect(await handle.jsonValue()).toBe("done");
    });

    it("string expression (isFunction=false) re-evaluates each poll", async () => {
      // A non-function string expression is evaled fresh each poll.
      // We can verify by using a counter on the window.
      (window as any).__wffCounter = 0;
      const page = createPage();
      const handle = await (page as any).waitForFunction(
        "++window.__wffCounter >= 3 ? window.__wffCounter : 0",
        undefined,
        { polling: 10 }
      );
      expect(await handle.jsonValue()).toBeGreaterThanOrEqual(3);
      delete (window as any).__wffCounter;
    });

    it("passes arg to the predicate", async () => {
      const page = createPage();
      const handle = await (page as any).waitForFunction(
        (x: number) => (x > 0 ? x : 0),
        5
      );
      expect(await handle.jsonValue()).toBe(5);
    });

    it("validates polling option: rejects non-positive number", async () => {
      const page = createPage();
      await expect(
        (page as any).waitForFunction(() => true, undefined, { polling: 0 })
      ).rejects.toThrow(/non-positive/);
      await expect(
        (page as any).waitForFunction(() => true, undefined, {
          polling: -1,
        })
      ).rejects.toThrow(/non-positive/);
    });

    it("validates polling option: rejects unknown string", async () => {
      const page = createPage();
      await expect(
        (page as any).waitForFunction(() => true, undefined, {
          polling: "mutation" as any,
        })
      ).rejects.toThrow(/Unknown polling/);
    });

    it("handle.dispose() returns a Promise", async () => {
      const page = createPage();
      const handle = await (page as any).waitForFunction(() => 1);
      const result = handle.dispose();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it("cleans up timers after resolve", async () => {
      const page = createPage();
      let counter = 0;
      const handle = await (page as any).waitForFunction(
        () => {
          counter++;
          return counter >= 2 ? counter : 0;
        },
        undefined,
        { polling: 10 }
      );
      const val = await handle.jsonValue();
      // Wait a bit — counter should NOT keep incrementing after resolve.
      await new Promise((r) => setTimeout(r, 50));
      expect(counter).toBe(val);
    });
  });
});
