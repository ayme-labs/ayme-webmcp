import type { Locator, Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { createBrowserPage } from "./browserPage";

describe("createBrowserPage", () => {
  it("reads plural text values in document order", async () => {
    document.body.innerHTML =
      "<ul><li>First</li><li>Second <span>item</span></li></ul>";
    const runtime = createBrowserPage();

    const items = runtime.page.locator("li");

    expect(await items.allInnerTexts()).toEqual(["First", "Second item"]);
    expect(await items.allTextContents()).toEqual(["First", "Second item"]);
  });

  it("reads scalar values strictly and retargets labeled controls", async () => {
    document.body.innerHTML = `
      <div id="read" data-kind="value"><span>Rendered</span></div>
      <label id="field-label">Field<input value="from-control" /></label>
      <button class="duplicate" data-kind="one">One</button>
      <button class="duplicate" data-kind="two">Two</button>`;
    const runtime = createBrowserPage();

    const read = runtime.page.locator("#read");
    expect(await read.getAttribute("data-kind")).toBe("value");
    expect(await read.innerHTML()).toBe("<span>Rendered</span>");
    expect(await read.innerText()).toBe("Rendered");
    expect(await read.textContent()).toBe("Rendered");
    expect(await runtime.page.locator("#field-label").inputValue()).toBe(
      "from-control"
    );
    await expect(
      runtime.page.locator(".duplicate").getAttribute("data-kind")
    ).rejects.toThrow("strict mode violation");
  });

  it("creates lazy Playwright-compatible finder locators", async () => {
    document.body.innerHTML = `
      <main id="finder-root">
        <section data-testid="profile-card" title="Profile details">
          <img alt="Profile photo" />
          <label for="name">Username</label>
          <input id="name" placeholder="Your username" />
          <button aria-label="Save profile">Save</button>
          <p>Unique finder text</p>
        </section>
      </main>`;
    const { page } = createBrowserPage();

    expect(await page.getByAltText("photo").count()).toBe(1);
    expect(await page.getByAltText("photo", { exact: true }).count()).toBe(0);
    expect(await page.getByLabel("User").count()).toBe(1);
    expect(await page.getByPlaceholder("username").count()).toBe(1);
    expect(await page.getByRole("button", { name: "Save" }).count()).toBe(1);
    expect(await page.getByTestId("profile-card").count()).toBe(1);
    expect(await page.getByText("Unique finder").count()).toBe(1);
    expect(
      await page.getByText("Unique finder text", { exact: true }).count()
    ).toBe(1);
    expect(await page.getByTitle("details").count()).toBe(1);

    const root = page.locator("#finder-root");
    expect(await root.getByRole("button").count()).toBe(1);
    expect(await root.locator("section").count()).toBe(1);
    expect(
      await page.locator("section", { hasText: "finder text" }).count()
    ).toBe(1);
    expect(
      await page
        .locator("section", { has: page.getByText("Unique finder") })
        .count()
    ).toBe(1);
    expect(
      await page
        .locator("section", { hasNot: page.getByText("Missing finder") })
        .count()
    ).toBe(1);

    const lateFinder = page.getByText("Added after construction");
    document
      .querySelector("main")
      ?.insertAdjacentHTML("beforeend", "<p>Added after construction</p>");
    expect(await lateFinder.count()).toBe(1);
  });

  it("preserves DOM-backed locator actions and trace recording", async () => {
    document.body.innerHTML =
      '<label for="message">Message</label><input id="message" /><button>Save</button>';
    const runtime = createBrowserPage();
    const input = runtime.page.getByRole("textbox", { name: "Message" });
    const button = runtime.page.getByRole("button", { name: "Save" });
    const pressed: string[] = [];

    document.querySelector("input")?.addEventListener("keydown", (event) => {
      pressed.push(event.key);
    });
    await input.fill("hello");
    await input.press("Enter");
    await button.click();

    expect(await input.count()).toBe(1);
    expect((document.querySelector("input") as HTMLInputElement).value).toBe(
      "hello"
    );
    expect(pressed).toEqual(["Enter"]);
    expect(runtime.trace.map((entry) => entry.operation)).toEqual([
      "fill",
      "press",
      "click",
    ]);
  });

  it("matches the selected Page and Locator observation signatures", () => {
    const runtime = createBrowserPage();
    const page: Pick<
      Page,
      "ariaSnapshot" | "content" | "setDefaultTimeout" | "title" | "url"
    > = runtime.page;
    const locator: Pick<Locator, "ariaSnapshot" | "waitFor"> =
      runtime.page.locator("body");

    expect(page.url()).toBe(window.location.href);
    expect(locator).toBeDefined();
  });

  it("observes page metadata and delegates ARIA rendering to the generated runtime", async () => {
    document.documentElement.innerHTML = `<head><title>Observation fixture</title></head>
      <body><main aria-label="Workspace"><button>Save</button></main></body>`;
    const runtime = createBrowserPage();

    const content = await runtime.page.content();
    const snapshot = await runtime.page.ariaSnapshot({
      boxes: true,
      depth: 2,
      mode: "ai",
    });
    const repeatedSnapshot = await runtime.page.ariaSnapshot({
      boxes: true,
      depth: 2,
      mode: "ai",
    });

    expect(content).toContain("<title>Observation fixture</title>");
    await expect(runtime.page.title()).resolves.toBe("Observation fixture");
    expect(runtime.page.url()).toBe(window.location.href);
    expect(snapshot).toContain('main "Workspace"');
    expect(snapshot).toContain("[box=0,0,0,0]");
    expect(repeatedSnapshot).toBe(snapshot);
  });

  it("rejects an aborted wait with the signal reason", async () => {
    const runtime = createBrowserPage();
    const controller = new AbortController();
    const wait = runtime.page
      .locator("#missing")
      .waitFor({ signal: controller.signal, timeout: 0 });

    controller.abort("fixture cancellation");

    await expect(wait).rejects.toMatchObject({
      cause: "fixture cancellation",
      name: "AbortError",
    });
  });

  it("composes locators and keeps all() results live after its count snapshot", async () => {
    document.body.innerHTML = `
      <article data-card="alpha">
        <span data-badge>Featured</span>
        <h2>Alpha</h2>
        <button data-item="alpha">Alpha</button>
      </article>
      <article data-card="beta">
        <h2>Beta</h2>
        <button data-item="beta">Beta</button>
      </article>
      <article data-card="gamma">
        <span data-badge>Featured</span>
        <h2>Gamma</h2>
        <button data-item="gamma">Gamma</button>
      </article>`;
    const runtime = createBrowserPage();
    const cards = runtime.page.locator("[data-card]");
    const items = runtime.page.locator("[data-item]");
    const featuredBadges = runtime.page
      .locator("[data-badge]")
      .filter({ hasText: "Featured" });

    expect(await cards.filter({ hasText: "alpha" }).count()).toBe(1);
    expect(await cards.filter({ hasNotText: "beta" }).count()).toBe(2);
    expect(
      await cards.filter({ has: runtime.page.locator("[data-badge]") }).count()
    ).toBe(2);
    expect(
      await cards
        .filter({ hasNot: runtime.page.locator("[data-badge]") })
        .count()
    ).toBe(1);
    expect(await cards.locator(featuredBadges).count()).toBe(2);
    expect(
      await runtime.page.locator("[data-card]", { has: featuredBadges }).count()
    ).toBe(2);
    expect(
      await runtime.page
        .locator("[data-card]", { hasNot: featuredBadges })
        .count()
    ).toBe(1);
    expect(
      await runtime.page
        .locator("body")
        .locator("[data-card]", { has: featuredBadges })
        .count()
    ).toBe(2);
    expect(
      await runtime.page
        .locator("body")
        .locator("[data-card]", { hasNot: featuredBadges })
        .count()
    ).toBe(1);

    const otherPage = createBrowserPage().page;
    expect(() => cards.locator(otherPage.locator("[data-badge]"))).toThrow(
      "Locators must belong to the same BrowserPage."
    );
    expect(() =>
      runtime.page.locator("[data-card]", {
        has: otherPage.locator("[data-badge]"),
      })
    ).toThrow("Locators must belong to the same BrowserPage.");

    expect(
      await items.and(runtime.page.locator('[data-item="beta"]')).count()
    ).toBe(1);
    expect(
      await items
        .filter({ hasText: "alpha" })
        .or(items.filter({ hasText: "gamma" }))
        .count()
    ).toBe(2);
    expect(await items.first().count()).toBe(1);
    expect(await items.last().count()).toBe(1);
    expect(await items.nth(1).count()).toBe(1);
    expect(await items.nth(-1).count()).toBe(1);

    const allItems = await items.all();
    expect(allItems).toHaveLength(3);
    const clicked: string[] = [];
    document.body.addEventListener("click", (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-item]"
      );
      if (item) clicked.push(item.dataset.item ?? "missing");
    });
    const inserted = document.createElement("button");
    inserted.dataset.item = "inserted";
    document.body.prepend(inserted);

    await allItems[0].click();
    expect(clicked).toEqual(["inserted"]);
  });
});
