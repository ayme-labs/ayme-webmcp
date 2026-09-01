// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureAriaSnapshot, listRegisteredPomRoots } = vi.hoisted(() => ({
  captureAriaSnapshot: vi.fn(),
  listRegisteredPomRoots: vi.fn(),
}));

vi.mock("@ayme-dev/playwright-browser", () => ({ captureAriaSnapshot }));
vi.mock("./registry", () => ({ listRegisteredPomRoots }));

import { getPageStateTool } from "./pageState";

describe("get_page_state", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="captured">Captured omitted</button>
      <div id="synthetic" aria-label="Synthetic root"></div>
      <button id="hidden" hidden>Hidden root</button>
    `;
    vi.clearAllMocks();
  });

  it("uses capture refs before synthetic refs and excludes hidden and foreign roots", async () => {
    const captured = document.querySelector("#captured");
    const synthetic = document.querySelector("#synthetic");
    const hidden = document.querySelector("#hidden");
    if (!captured || !synthetic || !hidden)
      throw new Error("Missing test roots.");
    const foreignDocument = document.implementation.createHTMLDocument("frame");
    const foreign = foreignDocument.body.appendChild(
      foreignDocument.createElement("button")
    );

    captureAriaSnapshot.mockReturnValue({
      distilledText: "- generic [ref=e1]",
      fullText: `
- generic [ref=e1]:
  - button "Captured omitted" [ref=e2]
`.trim(),
      refsByElement: new Map([
        [document.body, "e1"],
        [captured, "e2"],
        [hidden, "e3"],
        [foreign, "e4"],
      ]),
    });
    listRegisteredPomRoots.mockResolvedValue([
      { label: "ListPage.captured", element: captured },
      { label: "ListPage.synthetic", element: synthetic },
      { label: "ListPage.hidden", element: hidden },
      { label: "ListPage.foreign", element: foreign },
    ]);

    await expect(getPageStateTool.execute()).resolves.toBe(
      `
- [ref=e1] generic:
  - [ref=e2] button "Captured omitted":
    - /pom: ListPage.captured
  - [ref=s_1] generic "Synthetic root":
    - /pom: ListPage.synthetic
`.trim()
    );
  });
});
