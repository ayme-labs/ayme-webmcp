import { describe, expect, it } from "vitest";

import { captureAriaSnapshot } from "@ayme-dev/playwright-browser";

describe("Playwright browser capture", () => {
  it("captures distilled and full text with refs from the same DOM capture", () => {
    document.body.innerHTML = `
      <main>
        <h1>Account settings</h1>
        <button type="button">Save changes</button>
      </main>
    `;
    const button = document.querySelector("button");
    if (!button) throw new Error("Expected the test button to exist.");

    const result = captureAriaSnapshot(document.body);

    expect(Object.keys(result)).toEqual([
      "distilledText",
      "fullText",
      "refsByElement",
    ]);
    const buttonRef = result.refsByElement.get(button);
    expect(buttonRef).toMatch(/^e\d+$/);
    expect(result.distilledText).toContain(
      `button "Save changes" [ref=${buttonRef}]`
    );
    expect(result.fullText).toContain(
      `button "Save changes" [ref=${buttonRef}]`
    );
  });
});
