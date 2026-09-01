import type { Locator as PlaywrightLocator } from "@playwright/test";
import { beforeEach, describe, expect, it } from "vitest";

import { createBrowserPage } from "./browserPage";
import type { BrowserLocator } from "./browserPage";

describe("BrowserLocator browser-emulated actions", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps click, fill, and press signatures compatible with Playwright", () => {
    const { page } = createBrowserPage();
    const locator = page.locator("button");

    const click: PlaywrightLocator["click"] = locator.click;
    const fill: PlaywrightLocator["fill"] = locator.fill;
    const press: PlaywrightLocator["press"] = locator.press;

    const browserLocator: BrowserLocator = locator;
    expect(browserLocator).toBe(locator);
    expect(click).toBeTypeOf("function");
    expect(fill).toBeTypeOf("function");
    expect(press).toBeTypeOf("function");
  });

  it("resolves a live target strictly when each action executes", async () => {
    document.body.innerHTML = '<button id="target">Old</button>';
    const runtime = createBrowserPage({ pacing: { beforeActionMs: 5 } });
    const target = runtime.page.locator("#target");
    let newTargetClicked = false;

    window.setTimeout(() => {
      const replacement = document.createElement("button");
      replacement.id = "target";
      replacement.textContent = "New";
      replacement.addEventListener("click", () => {
        newTargetClicked = true;
      });
      document.querySelector("#target")?.replaceWith(replacement);
    }, 0);

    await target.click();
    expect(newTargetClicked).toBe(true);

    document.body.innerHTML = "<button>One</button><button>Two</button>";
    await expect(runtime.page.locator("button").click()).rejects.toThrow(
      "found 2"
    );
  });

  it("produces the promised DOM outcomes and synthetic events", async () => {
    document.body.innerHTML = `
      <form id="message-form">
        <label for="message">Message</label>
        <input id="message" value="before" />
      </form>
      <button id="save">Save</button>
    `;
    const runtime = createBrowserPage();
    const input = runtime.page.getByRole("textbox", { name: "Message" });
    const button = runtime.page.getByRole("button", { name: "Save" });
    const events: string[] = [];
    const trusted: boolean[] = [];
    let submitted = 0;

    const message = document.querySelector<HTMLInputElement>("#message");
    if (!message) throw new Error("The message fixture is missing.");
    for (const type of ["input", "change", "keydown", "keypress", "keyup"])
      message.addEventListener(type, (event) => {
        events.push(
          type === "input" || type === "change"
            ? type
            : `${type}:${(event as KeyboardEvent).key}`
        );
        trusted.push(event.isTrusted);
      });
    message.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted += 1;
    });

    const clickEvents: string[] = [];
    const clickTrusted: boolean[] = [];
    const save = document.querySelector("#save");
    if (!save) throw new Error("The button fixture is missing.");
    for (const type of [
      "pointerdown",
      "mousedown",
      "mouseup",
      "pointerup",
      "click",
    ])
      save.addEventListener(type, (event) => {
        clickEvents.push(type);
        clickTrusted.push(event.isTrusted);
      });

    await input.fill("hello");
    await input.press("Enter");
    await button.click();

    expect(message.value).toBe("hello");
    expect(events).toEqual([
      "input",
      "change",
      "keydown:Enter",
      "keypress:Enter",
      "keyup:Enter",
    ]);
    expect(trusted).toEqual([false, false, false, false, false]);
    expect(message === document.activeElement).toBe(true);
    expect(submitted).toBe(1);
    expect(clickEvents).toEqual(["click"]);
    expect(clickTrusted).toEqual([false]);
    expect(runtime.trace.map(({ operation }) => operation)).toEqual([
      "fill",
      "press",
      "click",
    ]);
  });

  it("does not claim device, actionability, or navigation semantics", async () => {
    document.body.innerHTML = `
      <button id="hidden" hidden>Hidden</button>
      <input id="disabled" disabled />
      <a id="navigate" href="#navigated">Navigate</a>
    `;
    const runtime = createBrowserPage();
    let hiddenClicks = 0;
    document.querySelector("#hidden")?.addEventListener("click", () => {
      hiddenClicks += 1;
    });

    await runtime.page.locator("#hidden").click({
      force: false,
      trial: true,
      timeout: 1,
    });
    await runtime.page.locator("#disabled").fill("still-filled", {
      force: false,
      timeout: 1,
    });
    await runtime.page.locator("#navigate").click({ noWaitAfter: false });

    expect(hiddenClicks).toBe(1);
    expect(
      (document.querySelector("#disabled") as HTMLInputElement).value
    ).toBe("still-filled");
    expect(
      document.querySelector<HTMLAnchorElement>("#navigate")?.href
    ).toContain("#navigated");
  });
});
