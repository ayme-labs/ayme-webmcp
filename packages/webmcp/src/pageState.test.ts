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

  it("reparents an omitted POM root without duplicating a distilled descendant", async () => {
    document.body.innerHTML = `
      <div id="pom-root">
        <button id="child">Nested child</button>
      </div>
    `;
    const pomRoot = document.querySelector("#pom-root");
    const child = document.querySelector("#child");
    if (!pomRoot || !child) throw new Error("Missing test roots.");

    captureAriaSnapshot.mockReturnValue({
      distilledText: `
- generic [ref=e1]:
  - button "Nested child" [ref=e3]
`.trim(),
      fullText: `
- generic [ref=e1]:
  - generic [ref=e2]:
    - button "Nested child" [ref=e3]
`.trim(),
      refsByElement: new Map([
        [document.body, "e1"],
        [pomRoot, "e2"],
        [child, "e3"],
      ]),
    });
    listRegisteredPomRoots.mockResolvedValue([
      { label: "ListPage.item", element: pomRoot },
    ]);

    await expect(getPageStateTool.execute()).resolves.toBe(
      `
- [ref=e1] generic:
  - [ref=e2] generic:
    - /pom: ListPage.item
    - [ref=e3] button "Nested child"
`.trim()
    );
  });

  it("resolves root candidates before capture and correlates only those candidates", async () => {
    document.body.innerHTML = '<button id="pre-capture">Pre-capture</button>';
    const preCaptureRoot = document.querySelector("#pre-capture");
    if (!preCaptureRoot) throw new Error("Missing pre-capture root.");
    let rootsResolved = false;

    listRegisteredPomRoots.mockImplementation(async () => {
      await Promise.resolve();
      rootsResolved = true;
      document.body.insertAdjacentHTML(
        "beforeend",
        '<button id="post-capture">Post-capture</button>'
      );
      return [{ label: "ListPage.preCapture", element: preCaptureRoot }];
    });
    captureAriaSnapshot.mockImplementation(() => {
      expect(rootsResolved).toBe(true);
      const postCaptureRoot = document.querySelector("#post-capture");
      if (!postCaptureRoot) throw new Error("Missing post-capture root.");
      return {
        distilledText: `
- generic [ref=e1]:
  - button "Pre-capture" [ref=e2]
  - button "Post-capture" [ref=e3]
`.trim(),
        fullText: `
- generic [ref=e1]:
  - button "Pre-capture" [ref=e2]
  - button "Post-capture" [ref=e3]
`.trim(),
        refsByElement: new Map([
          [document.body, "e1"],
          [preCaptureRoot, "e2"],
          [postCaptureRoot, "e3"],
        ]),
      };
    });

    await expect(getPageStateTool.execute()).resolves.toBe(
      `
- [ref=e1] generic:
  - [ref=e2] button "Pre-capture":
    - /pom: ListPage.preCapture
  - [ref=e3] button "Post-capture"
`.trim()
    );
  });
});
