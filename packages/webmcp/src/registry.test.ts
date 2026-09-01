import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserPage } from "@ayme-dev/playwright-browser";
import type { PomManifest } from "./contracts";

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(readonly callback: MutationCallback) {
    FakeMutationObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as MutationObserver);
  }
}

const emptyManifest = (className: string): PomManifest => ({
  className,
  components: [],
  members: [],
  tools: [],
});

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

describe("live Page Object registry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeMutationObserver.instances = [];
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("MutationObserver", FakeMutationObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("observes while at least one Page Object is registered", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    class FirstPage {}
    class SecondPage {}
    registry.registerCompiledPom(
      FirstPage,
      emptyManifest("FirstPage"),
      () => new FirstPage()
    );
    registry.registerCompiledPom(
      SecondPage,
      emptyManifest("SecondPage"),
      () => new SecondPage()
    );

    const first = registry.createPageRegistration(FirstPage);
    const second = registry.createPageRegistration(SecondPage);

    expect(FakeMutationObserver.instances).toHaveLength(1);
    expect(FakeMutationObserver.instances[0]?.observe).toHaveBeenCalledWith(
      document.documentElement,
      {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      }
    );
    expect(vi.getTimerCount()).toBe(1);

    first.dispose();
    expect(
      FakeMutationObserver.instances[0]?.disconnect
    ).not.toHaveBeenCalled();

    second.dispose();
    expect(
      FakeMutationObserver.instances[0]?.disconnect
    ).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces DOM mutations and ignores unchanged observations", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    const count = vi.fn(async () => 1);
    class PageWithLocator {}
    registry.registerCompiledPom(
      PageWithLocator,
      {
        ...emptyManifest("PageWithLocator"),
        members: [{ memberName: "item", kind: "locator", access: "field" }],
      },
      () => ({ item: { count } })
    );
    const registration = registry.createPageRegistration(PageWithLocator);
    const subscriber = vi.fn();
    registry.subscribeToRegisteredPoms(subscriber);

    await vi.runOnlyPendingTimersAsync();
    expect(count).toHaveBeenCalledOnce();
    expect(subscriber).toHaveBeenCalledOnce();

    const observer = FakeMutationObserver.instances[0];
    observer?.trigger();
    observer?.trigger();
    observer?.trigger();
    expect(vi.getTimerCount()).toBe(1);

    await vi.runOnlyPendingTimersAsync();
    expect(count).toHaveBeenCalledTimes(2);
    expect(subscriber).toHaveBeenCalledOnce();

    registration.dispose();
  });

  it("schedules an initial probe for every added Page Object", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    class FirstPage {}
    registry.registerCompiledPom(
      FirstPage,
      emptyManifest("FirstPage"),
      () => new FirstPage()
    );
    const first = registry.createPageRegistration(FirstPage);
    await vi.runOnlyPendingTimersAsync();

    const count = vi.fn(async () => 1);
    class LaterPage {}
    registry.registerCompiledPom(
      LaterPage,
      {
        ...emptyManifest("LaterPage"),
        members: [{ memberName: "item", kind: "locator", access: "field" }],
      },
      () => ({ item: { count } })
    );
    const later = registry.createPageRegistration(LaterPage);

    expect(vi.getTimerCount()).toBe(1);
    await vi.runOnlyPendingTimersAsync();
    expect(count).toHaveBeenCalledOnce();

    first.dispose();
    later.dispose();
  });

  it("keeps same-class registrations independent", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    class ReusedPage {}
    registry.registerCompiledPom(
      ReusedPage,
      emptyManifest("ReusedPage"),
      () => ({})
    );

    const first = registry.createPageRegistration(ReusedPage);
    const second = registry.createPageRegistration(ReusedPage);

    expect(registry.listRegisteredPoms()).toHaveLength(2);
    expect(registry.listRegisteredPoms().map(({ id }) => id)).toEqual([
      "ReusedPage",
      "ReusedPage",
    ]);

    first.dispose();
    expect(registry.listRegisteredPoms()).toHaveLength(1);
    expect(
      FakeMutationObserver.instances[0]?.disconnect
    ).not.toHaveBeenCalled();

    second.dispose();
    expect(registry.listRegisteredPoms()).toHaveLength(0);
    expect(
      FakeMutationObserver.instances[0]?.disconnect
    ).toHaveBeenCalledOnce();
  });

  it("bounds recursive component manifests to the current component path", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    class RecursivePage {}
    registry.registerCompiledPom(
      RecursivePage,
      {
        className: "RecursivePage",
        tools: [],
        members: [
          {
            memberName: "node",
            kind: "component",
            access: "field",
            componentClassName: "Node",
            collection: false,
          },
        ],
        components: [
          {
            className: "Node",
            members: [
              { memberName: "root", kind: "locator", access: "field" },
              {
                memberName: "child",
                kind: "component",
                access: "field",
                componentClassName: "Node",
                collection: false,
              },
            ],
            tools: [action("open")],
          },
        ],
      },
      () => ({
        node: {
          root: { count: async () => 1 },
          open: vi.fn(),
        },
      })
    );

    const registration = registry.createPageRegistration(RecursivePage);
    await vi.runOnlyPendingTimersAsync();

    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "RecursivePage.node.open",
    ]);

    registration.dispose();
  });

  it("lists tools for live singular and nested component roots", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    let dialogRootCount = 1;
    let panelRootCount = 0;
    const confirm = vi.fn();
    const save = vi.fn();
    class NestedPage {}
    registry.registerCompiledPom(
      NestedPage,
      {
        className: "NestedPage",
        tools: [],
        members: [
          {
            memberName: "dialog",
            kind: "component",
            access: "field",
            componentClassName: "Dialog",
            collection: false,
          },
        ],
        components: [
          {
            className: "Dialog",
            members: [
              { memberName: "root", kind: "locator", access: "field" },
              {
                memberName: "panel",
                kind: "component",
                access: "field",
                componentClassName: "Panel",
                collection: false,
              },
            ],
            tools: [action("confirm")],
          },
          {
            className: "Panel",
            members: [{ memberName: "root", kind: "locator", access: "field" }],
            tools: [action("save")],
          },
        ],
      },
      () => ({
        dialog: {
          root: { count: async () => dialogRootCount },
          confirm,
          panel: {
            root: { count: async () => panelRootCount },
            save,
          },
        },
      })
    );
    const registration = registry.createPageRegistration(NestedPage);

    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "NestedPage.dialog.confirm",
    ]);

    const confirmTool = registry.listRegisteredTools()[0];
    await confirmTool?.execute({});
    expect(confirm).toHaveBeenCalledOnce();

    panelRootCount = 1;
    FakeMutationObserver.instances[0]?.trigger();
    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "NestedPage.dialog.confirm",
      "NestedPage.dialog.panel.save",
    ]);

    const nestedTool = registry.listRegisteredTools()[1];
    await nestedTool?.execute({});
    expect(save).toHaveBeenCalledOnce();

    dialogRootCount = 0;
    panelRootCount = 0;
    FakeMutationObserver.instances[0]?.trigger();
    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools()).toHaveLength(0);

    registration.dispose();
  });

  it("lists collection tools only for their direct live roots", async () => {
    const registry = await import("./registry");
    registry.configureAymeRuntime({} as BrowserPage);

    let rootCount = 0;
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
            members: [
              { memberName: "root", kind: "locator", access: "field" },
              {
                memberName: "child",
                kind: "component",
                access: "field",
                componentClassName: "Child",
                collection: false,
              },
            ],
            tools: [action("archive")],
          },
          {
            className: "Child",
            members: [{ memberName: "root", kind: "locator", access: "field" }],
            tools: [],
          },
        ],
      },
      () => ({
        addItem: vi.fn(),
        items: [
          {
            root: { count: async () => rootCount },
            child: { root: { count: async () => 1 } },
            archive: vi.fn(),
          },
        ],
      })
    );
    const registration = registry.createPageRegistration(ItemsPage);

    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "addItem",
    ]);

    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "addItem",
    ]);

    rootCount = 1;
    FakeMutationObserver.instances[0]?.trigger();
    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "addItem",
      "ItemsPage.items.archive",
    ]);

    rootCount = 0;
    FakeMutationObserver.instances[0]?.trigger();
    await vi.runOnlyPendingTimersAsync();
    expect(registry.listRegisteredTools().map(({ name }) => name)).toEqual([
      "addItem",
    ]);

    registration.dispose();
  });
});
