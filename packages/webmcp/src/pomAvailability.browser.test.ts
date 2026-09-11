import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPage } from "@ayme-dev/playwright-browser";
import ayme from "./index";
import {
  createAymeRuntime,
  createPageRegistration,
  listRegisteredPomRoots,
  listRegisteredPomTools,
  listRegisteredPoms,
  probeRegisteredPomMembers,
  registerCompiledPom,
} from "./registry";
import { synchronizeWebMcpTools } from "./webMcp";
import type {
  PomComponentMemberManifest,
  PomManifest,
  ToolManifest,
} from "./contracts";

const action = (methodName: string, toolName = methodName): ToolManifest => ({
  methodName,
  toolName,
  description: methodName,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  parameters: [],
});
const child = (
  memberName: string,
  collection = false
): PomComponentMemberManifest => ({
  memberName,
  collection,
  kind: "component",
  access: "field",
  componentClassName: "Panel",
});
const manifest = (
  className: string,
  members: PomManifest["members"],
  tools: ToolManifest[] = []
): PomManifest => ({
  className,
  members,
  tools,
  components: [
    {
      className: "Panel",
      members: [{ memberName: "root", kind: "locator", access: "field" }],
      tools: [action("close")],
    },
  ],
});
const names = () => listRegisteredPomTools().map((tool) => tool.name);

describe("live Page Object availability", () => {
  let page: ReturnType<typeof createPage>;
  let runtime: ReturnType<typeof createAymeRuntime>;
  beforeEach(() => {
    document.body.innerHTML = "";
    page = createPage();
    runtime = createAymeRuntime(page);
  });
  afterEach(() => {
    runtime.dispose();
    document.body.innerHTML = "";
  });

  it("removes tools and structural labels together when a root becomes unavailable", async () => {
    document.body.innerHTML =
      '<aside id="sidebar" style="display:none;width:240px;height:120px">Sidebar</aside>';
    class Shell {
      sidebar = { root: page.locator("#sidebar"), close() {} };
      open() {}
    }
    registerCompiledPom(
      Shell,
      manifest("Shell", [child("sidebar")], [action("open", "Shell.open")])
    );
    createPageRegistration(Shell);
    const sidebar = document.getElementById("sidebar")!;
    let clicks = 0;
    sidebar.addEventListener("click", () => clicks++);

    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.open"]);
    expect((await ayme.getPageState()).text).not.toContain("Shell.sidebar");

    sidebar.setAttribute("style", "width:240px;height:120px");
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.open", "Shell.sidebar.close"]);
    expect((await ayme.getPageState()).text).toContain("Shell.sidebar");

    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="overlay" style="position:fixed;inset:0;z-index:10"></div>'
    );
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.open"]);
    expect((await ayme.getPageState()).text).not.toContain("Shell.sidebar");

    document.getElementById("overlay")!.remove();
    sidebar.setAttribute(
      "style",
      "position:fixed;left:0;top:0;width:240px;height:120px;transform:translateX(-100%)"
    );
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.open"]);
    expect((await ayme.getPageState()).text).not.toContain("Shell.sidebar");

    sidebar.setAttribute("style", "width:240px;height:120px");
    await probeRegisteredPomMembers();
    expect(names()).toContain("Shell.sidebar.close");
    expect((await ayme.getPageState()).text).toContain("Shell.sidebar");
    sidebar.remove();
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.open"]);
    expect((await ayme.getPageState()).text).not.toContain("Shell.sidebar");
    expect(listRegisteredPoms()[0]?.manifest.components[0]?.tools).toHaveLength(
      1
    );
    expect(clicks).toBe(0);
  });

  it("refreshes direct page-state capture without publication", async () => {
    document.body.innerHTML = '<aside id="sidebar">Sidebar</aside>';
    class Shell {
      sidebar = { root: page.locator("#sidebar"), close() {} };
    }
    registerCompiledPom(Shell, manifest("Shell", [child("sidebar")]));
    createPageRegistration(Shell);
    expect((await ayme.getPageState()).text).toContain("Shell.sidebar");
    document.getElementById("sidebar")!.style.visibility = "hidden";
    expect((await ayme.getPageState()).text).not.toContain("Shell.sidebar");
    expect(names()).toEqual([]);
  });

  it("gates rooted page actions and preserves rootless actions", async () => {
    document.body.innerHTML = '<section id="root">Page</section>';
    class Rooted {
      root = page.locator("#root");
      close() {}
    }
    class Rootless {
      open() {}
    }
    registerCompiledPom(
      Rooted,
      manifest(
        "Rooted",
        [{ memberName: "root", kind: "locator", access: "field" }],
        [action("close", "Rooted.close")]
      )
    );
    registerCompiledPom(
      Rootless,
      manifest("Rootless", [], [action("open", "Rootless.open")])
    );
    createPageRegistration(Rooted);
    createPageRegistration(Rootless);
    expect(names()).toEqual(["Rootless.open"]);
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Rooted.close", "Rootless.open"]);
    expect((await listRegisteredPomRoots()).map((root) => root.label)).toEqual([
      "Rooted",
    ]);
    document.getElementById("root")!.style.display = "none";
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Rootless.open"]);
  });

  it("keeps collection indices and publishes a shared tool only for available instances", async () => {
    document.body.innerHTML =
      '<section id="first" hidden>First</section><section id="second">Second</section>';
    class Shell {
      panels = ["first", "second"].map((id) => ({
        root: page.locator(`#${id}`),
        close() {},
      }));
    }
    registerCompiledPom(Shell, manifest("Shell", [child("panels", true)]));
    createPageRegistration(Shell);
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shell.panels.close"]);
    expect((await listRegisteredPomRoots()).map((root) => root.label)).toEqual([
      "Shell.panels[1]",
    ]);
    document.getElementById("second")!.setAttribute("hidden", "");
    await probeRegisteredPomMembers();
    expect(names()).toEqual([]);
    expect(await listRegisteredPomRoots()).toEqual([]);
  });

  it("keeps same-class registrations independent", async () => {
    document.body.innerHTML =
      '<section id="first" hidden>First</section><section id="second">Second</section>';
    class Shared {
      root = page.locator("#first");
      close() {}
    }
    registerCompiledPom(
      Shared,
      manifest("Shared", [], [action("close", "Shared.close")])
    );
    const first = createPageRegistration(Shared);
    const second = createPageRegistration(Shared);
    second.instance.root = page.locator("#second");
    await probeRegisteredPomMembers();
    expect(names()).toEqual(["Shared.close"]);
    expect(
      (await listRegisteredPomRoots()).map((root) => root.element.id)
    ).toEqual(["second"]);
    second.dispose();
    expect(names()).toEqual([]);
    first.dispose();
  });

  it("updates publication after layout events without a DOM mutation", async () => {
    document.body.innerHTML =
      '<style id="availability-style">#sidebar { visibility: visible; }</style><aside id="sidebar">Sidebar</aside>';
    class Shell {
      sidebar = { root: page.locator("#sidebar"), close() {} };
    }
    registerCompiledPom(Shell, manifest("Shell", [child("sidebar")]));
    createPageRegistration(Shell);
    const published = new Map<string, unknown>();
    const publication = await synchronizeWebMcpTools({
      async registerTool(
        tool: { name: string },
        options?: { signal?: AbortSignal }
      ) {
        published.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => {
          if (published.get(tool.name) === tool) published.delete(tool.name);
        });
      },
    });
    try {
      await expect
        .poll(() => [...published.keys()])
        .toEqual(["get_page_state", "Shell.sidebar.close"]);
      const rule = document.querySelector<HTMLStyleElement>(
        "#availability-style"
      )!.sheet!.cssRules[0] as CSSStyleRule;
      rule.style.visibility = "hidden";
      expect(
        getComputedStyle(document.getElementById("sidebar")!).visibility
      ).toBe("hidden");
      window.dispatchEvent(new Event("resize"));
      await expect
        .poll(() => [...published.keys()])
        .toEqual(["get_page_state"]);
      rule.style.visibility = "visible";
      window.dispatchEvent(new Event("transitionend"));
      await expect
        .poll(() => [...published.keys()])
        .toEqual(["get_page_state", "Shell.sidebar.close"]);
    } finally {
      publication.dispose();
    }
  });

  it("does not publish a disposed registration after its async observation completes", async () => {
    document.body.innerHTML = '<section id="root">Panel</section>';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    class Shell {
      async panels() {
        await pending;
        return [{ root: page.locator("#root"), close() {} }];
      }
    }
    registerCompiledPom(
      Shell,
      manifest("Shell", [{ ...child("panels", true), access: "method" }])
    );
    const registration = createPageRegistration(Shell);
    const probe = probeRegisteredPomMembers();
    await Promise.resolve();
    registration.dispose();
    release();
    await probe;
    expect(names()).toEqual([]);
    expect(await listRegisteredPomRoots()).toEqual([]);
  });

  it("lets a new runtime observe while a disposed runtime still has a pending member", async () => {
    document.body.innerHTML = '<section id="root">Panel</section>';
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    class SlowShell {
      async panels() {
        started();
        await pending;
        return [{ root: page.locator("#root"), close() {} }];
      }
    }
    registerCompiledPom(
      SlowShell,
      manifest("SlowShell", [{ ...child("panels", true), access: "method" }])
    );
    createPageRegistration(SlowShell);
    const previousProbe = probeRegisteredPomMembers();
    await entered;
    runtime.dispose();
    runtime = createAymeRuntime(page);
    class FreshShell {
      root = page.locator("#root");
      close() {}
    }
    registerCompiledPom(
      FreshShell,
      manifest("FreshShell", [], [action("close", "FreshShell.close")])
    );
    createPageRegistration(FreshShell);
    try {
      await expect.poll(names).toEqual(["FreshShell.close"]);
    } finally {
      release();
      await previousProbe;
    }
    expect(names()).toEqual(["FreshShell.close"]);
    expect((await listRegisteredPomRoots()).map((root) => root.label)).toEqual([
      "FreshShell",
    ]);
  });
});
