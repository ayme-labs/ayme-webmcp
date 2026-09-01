import { describe, expect, it } from "vitest";

import { createBrowserPage } from "./browserPage";

describe("createBrowserPage", () => {
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
      "click",
    ]);
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
