import { describe, expect, it } from "vitest";

import { createBrowserPage } from "./browserPage";

describe("createBrowserPage", () => {
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
});
