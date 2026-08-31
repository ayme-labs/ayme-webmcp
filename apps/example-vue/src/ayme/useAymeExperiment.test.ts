import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPageRegistration,
  registerCompiledPom,
} from "@ayme-dev/webmcp/internal";
import { ListPage } from "../../playwright/pom/ListPage";
import { useAymeExperiment } from "./useAymeExperiment";

describe("useAymeExperiment", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
    delete window.__AYME_DISABLE_RELAY__;
  });

  it("disposes WebMCP publication that finishes after unmount", async () => {
    vi.useFakeTimers();
    registerCompiledPom(
      ListPage,
      {
        className: "ListPage",
        components: [],
        members: [],
        tools: [
          {
            methodName: "addItem",
            toolName: "ListPage.addItem",
            description: "Add an item.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
            parameters: [],
          },
        ],
      },
      () => ({ addItem() {} })
    );
    window.__AYME_DISABLE_RELAY__ = true;

    const wrapper = mount(
      defineComponent({
        setup() {
          useAymeExperiment();
          return () => h("div");
        },
      })
    );
    await flushPromises();
    wrapper.unmount();

    const signals: AbortSignal[] = [];
    const registerTool = vi.fn(
      async (_tool: unknown, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
      }
    );
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();

    const lateRegistration = createPageRegistration(ListPage);
    await flushPromises();
    expect(registerTool).toHaveBeenCalledOnce();
    expect(signals[0]?.aborted).toBe(true);
    lateRegistration.dispose();
  });
});
