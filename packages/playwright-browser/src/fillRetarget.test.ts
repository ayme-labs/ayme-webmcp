import { afterEach, expect, it } from "vitest";

import { createPage } from "./index";

afterEach(() => {
  document.body.innerHTML = "";
});

it.each([
  ["wrapping", '<label>Caption<input value="old"></label>'],
  [
    "linked",
    '<label for="control">Caption</label><input id="control" value="old">',
  ],
])("fills a %s label's control", async (_kind, markup) => {
  for (const typingIntervalMs of [0, 1]) {
    document.body.innerHTML = markup;
    const page = createPage({ pacing: { typingIntervalMs } });
    const label = page.locator("label");

    await label.fill("new value");
    expect(document.querySelector("input")?.value).toBe("new value");
    expect(document.querySelector("label")?.textContent).toBe("Caption");

    await label.fill("");
    expect(document.querySelector("input")?.value).toBe("");
    expect(document.querySelector("label")?.textContent).toBe("Caption");
  }
});
