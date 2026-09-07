// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

const { captureAriaSnapshot, listRegisteredPomRoots } = vi.hoisted(() => ({
  captureAriaSnapshot: vi.fn(),
  listRegisteredPomRoots: vi.fn(),
}));

vi.mock("@ayme-dev/playwright-browser", () => ({ captureAriaSnapshot }));
vi.mock("./registry", () => ({ listRegisteredPomRoots }));

import { getPageStateForDocument } from "./pageState";
import { createRefInteractions } from "./refInteractions";

describe("Structural Ref interactions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "document",
      document.implementation.createHTMLDocument("Ref interactions test")
    );
    document.body.innerHTML = '<button id="save">Save changes</button>';
    listRegisteredPomRoots.mockResolvedValue([]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("freshly resolves a ref and delegates click to the page locator", async () => {
    const button = document.querySelector("#save");
    if (!button) throw new Error("Expected the save button.");
    mockCapture(button, "e2");
    await getPageStateForDocument(document);
    const click = vi.fn().mockResolvedValue(undefined);
    const page = fakePage(click);

    await createRefInteractions(page).click("e2");

    expect(captureAriaSnapshot).toHaveBeenCalledTimes(2);
    expect(page.locator).toHaveBeenCalledWith("aria-ref=e2");
    expect(click).toHaveBeenCalledOnce();
  });

  it("retargets a historical ref to the current ref before filling", async () => {
    const original = document.querySelector("#save");
    if (!original) throw new Error("Expected the original button.");
    mockCapture(original, "e2");
    await getPageStateForDocument(document);

    const replacement = document.createElement("button");
    replacement.id = "save";
    replacement.textContent = "Save changes";
    original.replaceWith(replacement);
    mockCapture(replacement, "e4", "e3");

    const fill = vi.fn().mockResolvedValue(undefined);
    const page = fakePage(vi.fn(), fill);
    await createRefInteractions(page).fill("e2", "updated");

    expect(page.locator).toHaveBeenCalledWith("aria-ref=e4");
    expect(fill).toHaveBeenCalledWith("updated");
  });

  it("rejects an unknown ref with a stable error", async () => {
    const button = document.querySelector("#save");
    if (!button) throw new Error("Expected the save button.");
    mockCapture(button, "e2");
    await getPageStateForDocument(document);

    const page = fakePage();
    await expect(createRefInteractions(page).click("e999")).rejects.toThrow(
      'Cannot click ref "e999": unknown-ref.'
    );
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("rejects a removed ref with a stable error", async () => {
    const button = document.querySelector("#save");
    if (!button) throw new Error("Expected the save button.");
    const initial = captureFor(button, "e2");
    captureAriaSnapshot.mockReturnValueOnce(initial).mockReturnValueOnce({
      distilledText: "- generic [ref=e1]",
      fullText: "- generic [ref=e1]",
      refsByElement: new Map([[document.body, "e1"]]),
    });
    await getPageStateForDocument(document);
    button.remove();

    const page = fakePage();
    await expect(createRefInteractions(page).click("e2")).rejects.toThrow(
      'Cannot click ref "e2": removed.'
    );
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous ref with a stable error", async () => {
    const button = document.querySelector("#save");
    if (!button) throw new Error("Expected the save button.");
    const first = document.createElement("button");
    first.disabled = true;
    first.textContent = "Save changes";
    const second = document.createElement("button");
    second.disabled = true;
    second.textContent = "Save changes";
    captureAriaSnapshot
      .mockReturnValueOnce(captureFor(button, "e2"))
      .mockReturnValueOnce({
        distilledText:
          '- generic [ref=e1]:\n  - button "Save changes" [disabled] [ref=e4]\n  - button "Save changes" [disabled] [ref=e5]',
        fullText:
          '- generic [ref=e1]:\n  - button "Save changes" [disabled] [ref=e4]\n  - button "Save changes" [disabled] [ref=e5]',
        refsByElement: new Map([
          [document.body, "e1"],
          [first, "e4"],
          [second, "e5"],
        ]),
      });
    document.body.replaceChildren(first, second);
    await getPageStateForDocument(document);

    const page = fakePage();
    await expect(createRefInteractions(page).click("e2")).rejects.toThrow(
      'Cannot click ref "e2": ambiguous.'
    );
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("rejects a ref with no actionable element with a stable error", async () => {
    mockCapture(undefined, "e2");
    await getPageStateForDocument(document);

    const page = fakePage();
    await expect(createRefInteractions(page).click("e2")).rejects.toThrow(
      'Cannot click ref "e2": no-element.'
    );
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("rejects synthetic observation-only refs before creating a locator", async () => {
    const root = document.createElement("div");
    const button = document.querySelector("#save");
    if (!button) throw new Error("Expected the save button.");
    root.append(button);
    document.body.append(root);
    listRegisteredPomRoots.mockResolvedValue([
      { label: "Page.root", element: root },
    ]);
    captureAriaSnapshot.mockReturnValue({
      distilledText: '- generic [ref=e1]:\n  - button "Save changes" [ref=e2]',
      fullText:
        '- generic [ref=e1]:\n  - generic:\n    - button "Save changes" [ref=e2]',
      refsByElement: new Map([
        [document.body, "e1"],
        [button, "e2"],
      ]),
    });
    await getPageStateForDocument(document);

    const page = fakePage();
    await expect(createRefInteractions(page).click("s_1")).rejects.toThrow(
      'Cannot click ref "s_1": synthetic observation-only ref.'
    );
    expect(page.locator).not.toHaveBeenCalled();
  });
});

function fakePage(
  click = vi.fn().mockResolvedValue(undefined),
  fill = vi.fn().mockResolvedValue(undefined)
): Page {
  const locator = vi.fn(() => ({ click, fill }));
  return { locator } as unknown as Page;
}

function captureFor(element: Element, ref: string) {
  return {
    distilledText: `- generic [ref=e1]:\n  - button "Save changes" [ref=${ref}]`,
    fullText: `- generic [ref=e1]:\n  - button "Save changes" [ref=${ref}]`,
    refsByElement: new Map([
      [document.body, "e1"],
      [element, ref],
    ]),
  };
}

function mockCapture(
  element: Element | undefined,
  elementRef: string,
  rootRef = "e1",
  tree = `- generic [ref=${rootRef}]:\n  - button "Save changes" [ref=${elementRef}]`,
  refs: [Element, string][] = element
    ? [
        [document.body, rootRef],
        [element, elementRef],
      ]
    : [[document.body, rootRef]]
) {
  captureAriaSnapshot.mockReturnValue({
    distilledText: tree,
    fullText: tree,
    refsByElement: new Map(refs),
  });
}
