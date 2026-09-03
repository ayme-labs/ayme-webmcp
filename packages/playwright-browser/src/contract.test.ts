/* eslint-disable @typescript-eslint/no-explicit-any -- intentional casts to test runtime validation */
import { describe, expect, it } from "vitest";

import {
  createPage,
  isAymeLocator,
  LOCATOR_BRAND,
  resolveLocatorElements,
} from "./index";

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
});
