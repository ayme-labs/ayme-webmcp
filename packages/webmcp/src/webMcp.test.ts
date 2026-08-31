import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserPage } from "./browserPage";

type PublishedTool = { name: string };

vi.mock("./pageState", () => ({
  getPageStateTool: {
    name: "get_page_state",
    description: "Get page state.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    execute: async () => "",
  },
}));

class FakeMutationObserver {
  static instance: FakeMutationObserver | undefined;

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(readonly callback: MutationCallback) {
    FakeMutationObserver.instance = this;
  }

  trigger() {
    this.callback([], this as unknown as MutationObserver);
  }
}

const action = (methodName: string) => ({
  methodName,
  toolName: methodName,
  description: methodName,
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
    additionalProperties: false,
  },
  parameters: [],
});

async function flushPublisher() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("WebMCP publisher", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeMutationObserver.instance = undefined;
    vi.stubGlobal("MutationObserver", FakeMutationObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps published tools synchronized with live Page Objects", async () => {
    const registrations: Array<{
      tool: PublishedTool;
      signal: AbortSignal;
    }> = [];
    const registerTool = vi.fn(
      async (tool: PublishedTool, options: { signal: AbortSignal }) => {
        registrations.push({ tool, signal: options.signal });
      }
    );
    vi.stubGlobal("document", { documentElement: {} });

    const registry = await import("./registry");
    const { synchronizeWebMcpTools } = await import("./webMcp");
    registry.configureAymeRuntime({} as BrowserPage);

    let rootCount = 1;
    class ItemsPage {}
    registry.registerCompiledPom(
      ItemsPage,
      {
        className: "ItemsPage",
        tools: [action("addItem")],
        members: [
          {
            memberName: "items",
            kind: "component",
            access: "field",
            componentClassName: "Item",
            collection: true,
          },
        ],
        components: [
          {
            className: "Item",
            members: [{ memberName: "root", kind: "locator", access: "field" }],
            tools: [action("archive")],
          },
        ],
      },
      () => ({
        addItem: vi.fn(),
        items: [
          {
            root: { count: async () => rootCount },
            archive: vi.fn(),
          },
        ],
      })
    );
    const pageRegistration = registry.createPageRegistration(ItemsPage);

    const publication = await synchronizeWebMcpTools({ registerTool });
    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      "get_page_state",
      "addItem",
    ]);

    await vi.runOnlyPendingTimersAsync();
    await flushPublisher();
    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      "get_page_state",
      "addItem",
      "ItemsPage.items.archive",
    ]);

    FakeMutationObserver.instance?.trigger();
    await vi.runOnlyPendingTimersAsync();
    await flushPublisher();
    expect(registerTool).toHaveBeenCalledTimes(3);

    rootCount = 0;
    FakeMutationObserver.instance?.trigger();
    await vi.runOnlyPendingTimersAsync();
    await flushPublisher();
    expect(registrations[2]?.signal.aborted).toBe(true);
    expect(registrations[0]?.signal.aborted).toBe(false);
    expect(registrations[1]?.signal.aborted).toBe(false);

    pageRegistration.dispose();
    await flushPublisher();
    expect(registrations[1]?.signal.aborted).toBe(true);
    expect(registrations[0]?.signal.aborted).toBe(false);

    const replacementPageRegistration =
      registry.createPageRegistration(ItemsPage);
    await flushPublisher();
    expect(registrations[3]?.signal.aborted).toBe(false);

    publication.dispose();
    expect(registrations[0]?.signal.aborted).toBe(true);
    expect(registrations[3]?.signal.aborted).toBe(true);

    replacementPageRegistration.dispose();
  });

  it("keeps the first live registration as the stable owner of duplicate tools", async () => {
    const registrations: Array<{
      tool: PublishedTool;
      signal: AbortSignal;
    }> = [];
    const registerTool = vi.fn(
      async (tool: PublishedTool, options: { signal: AbortSignal }) => {
        registrations.push({ tool, signal: options.signal });
      }
    );
    vi.stubGlobal("document", { documentElement: {} });

    const registry = await import("./registry");
    const { synchronizeWebMcpTools } = await import("./webMcp");
    registry.configureAymeRuntime({} as BrowserPage);

    class SharedPage {}
    registry.registerCompiledPom(
      SharedPage,
      {
        className: "SharedPage",
        tools: [action("run")],
        members: [],
        components: [],
      },
      () => ({ run: vi.fn() })
    );

    const first = registry.createPageRegistration(SharedPage);
    const publication = await synchronizeWebMcpTools({ registerTool });
    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      "get_page_state",
      "run",
    ]);

    const second = registry.createPageRegistration(SharedPage);
    await flushPublisher();
    expect(registrations).toHaveLength(2);
    expect(registrations[0]?.signal.aborted).toBe(false);
    expect(registrations[1]?.signal.aborted).toBe(false);

    second.dispose();
    await flushPublisher();
    expect(registrations).toHaveLength(2);
    expect(registrations[0]?.signal.aborted).toBe(false);
    expect(registrations[1]?.signal.aborted).toBe(false);

    const replacementOwner = registry.createPageRegistration(SharedPage);
    await flushPublisher();
    expect(registrations).toHaveLength(2);
    expect(registrations[0]?.signal.aborted).toBe(false);
    expect(registrations[1]?.signal.aborted).toBe(false);

    first.dispose();
    await flushPublisher();
    expect(registrations).toHaveLength(3);
    expect(registrations[0]?.signal.aborted).toBe(false);
    expect(registrations[1]?.signal.aborted).toBe(true);
    expect(registrations[2]?.signal.aborted).toBe(false);

    replacementOwner.dispose();
    publication.dispose();
    expect(registrations[0]?.signal.aborted).toBe(true);
    expect(registrations[2]?.signal.aborted).toBe(true);
  });
});
