// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPageStateForDocument, getPomDefinitions } = vi.hoisted(() => ({
  getPageStateForDocument: vi.fn(),
  getPomDefinitions: vi.fn(),
}));

vi.mock("./pageState", () => ({ getPageStateForDocument }));
vi.mock("./pomDefinitions", () => ({ getPomDefinitions }));

import { getPageContextForDocument, getPageContextTool } from "./pageContext";

describe("get_page_context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "document",
      document.implementation.createHTMLDocument("Page context test")
    );
    getPageStateForDocument.mockResolvedValue({
      text: '- e1 button "Save changes"',
      resolve: vi.fn(),
    });
    getPomDefinitions.mockReturnValue({
      definitions: [
        {
          name: "ProfileMenu",
          description: "The user profile menu.",
          children: [],
          actions: [],
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("combines current structure and POM definitions while retaining ref resolution", async () => {
    const resolve = vi.fn();
    getPageStateForDocument.mockResolvedValue({
      text: '- e1 button "Save changes"',
      resolve,
    });
    const context = await getPageContextForDocument(document);

    expect(context.structure).toBe('- e1 button "Save changes"');
    expect(context.pomDefinitions).toEqual([
      {
        name: "ProfileMenu",
        description: "The user profile menu.",
        children: [],
        actions: [],
      },
    ]);
    expect(context.resolve).toBe(resolve);
    expect(getPomDefinitions).toHaveBeenCalledWith(undefined);
  });

  it("returns a JSON-safe context payload and forwards a named definition filter", async () => {
    await expect(
      getPageContextTool.execute({ name: "ProfileMenu" })
    ).resolves.toEqual({
      structure: '- e1 button "Save changes"',
      pomDefinitions: [
        {
          name: "ProfileMenu",
          description: "The user profile menu.",
          children: [],
          actions: [],
        },
      ],
    });
    expect(getPomDefinitions).toHaveBeenCalledWith("ProfileMenu");
  });
});
