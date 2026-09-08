import { effectScope } from "vue";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import {
  createAymeRuntime,
  createPageRegistration,
  synchronizeWebMcpTools,
  waitForWebMcpDriver,
  type WebMcpDriver,
} from "@ayme-dev/webmcp/internal";
import {
  useAymeWebMcp,
  usePageObject,
  type UseAymeWebMcpOptions,
} from "./index";

class FakePageObject {
  describe() {
    return "fake page object";
  }
}

class ComplexPageObject {
  constructor(...args: [object, object]) {
    void args;
  }
}

const dispose = vi.fn();
const disposeRuntime = vi.fn();
const disposePublication = vi.fn();
const page = {} as NonNullable<UseAymeWebMcpOptions["page"]>;

async function flushPublication() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

vi.mock("@ayme-dev/webmcp/internal", () => ({
  createAymeRuntime: vi.fn(),
  createPageRegistration: vi.fn(),
  synchronizeWebMcpTools: vi.fn(),
  waitForWebMcpDriver: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createPageRegistration).mockReturnValue({
    instance: new FakePageObject(),
    dispose,
  });
  vi.mocked(createAymeRuntime).mockReturnValue({
    page,
    dispose: disposeRuntime,
  });
  vi.mocked(synchronizeWebMcpTools).mockResolvedValue({
    message: "Published WebMCP tools.",
    dispose: disposePublication,
  });
  vi.mocked(waitForWebMcpDriver).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePageObject", () => {
  it("requires an active effect scope before activating the page object", () => {
    expect(() => usePageObject(FakePageObject)).toThrow();
    expect(createPageRegistration).not.toHaveBeenCalled();
  });

  it("activates once and returns the concrete page object type", () => {
    const scope = effectScope();
    const pageObject = scope.run(() => usePageObject(FakePageObject));

    if (!pageObject) throw new Error("The page object was not returned.");

    expectTypeOf(pageObject).toEqualTypeOf<FakePageObject>();
    expect(pageObject.describe()).toBe("fake page object");
    expect(createPageRegistration).toHaveBeenCalledTimes(1);
    expect(createPageRegistration).toHaveBeenCalledWith(FakePageObject);

    scope.stop();
  });

  it("rejects constructors with multiple required arguments", () => {
    expectTypeOf(ComplexPageObject).not.toMatchTypeOf<
      Parameters<typeof usePageObject>[0]
    >();
  });

  it("disposes the registration exactly once when the scope ends", () => {
    const scope = effectScope();
    scope.run(() => usePageObject(FakePageObject));

    scope.stop();
    scope.stop();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("useAymeWebMcp", () => {
  it("requires an active effect scope before claiming the runtime", () => {
    expect(() => useAymeWebMcp({ page })).toThrow(
      "useAymeWebMcp must be called within an active Vue effect scope"
    );
    expect(createAymeRuntime).not.toHaveBeenCalled();
  });

  it("initializes the root runtime before child Page Object registration", () => {
    const scope = effectScope();
    scope.run(() => {
      useAymeWebMcp({ page });
      usePageObject(FakePageObject);
    });

    expect(createAymeRuntime).toHaveBeenCalledWith(page);
    expect(createAymeRuntime).toHaveBeenCalledBefore(
      vi.mocked(createPageRegistration)
    );

    scope.stop();
  });

  it("keeps publication disabled by default and disposes the runtime", () => {
    const scope = effectScope();
    const result = scope.run(() => useAymeWebMcp({ page }));

    expect(result?.publicationStatus.value).toEqual({
      state: "disabled",
      message: "WebMCP publication is disabled.",
    });
    expect(waitForWebMcpDriver).not.toHaveBeenCalled();

    scope.stop();
    expect(disposeRuntime).toHaveBeenCalledOnce();
    expect(result?.publicationStatus.value.state).toBe("disposed");
  });

  it("publishes once when enabled and ignores retry while active", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    vi.mocked(waitForWebMcpDriver).mockResolvedValue(driver);
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    expect(result?.publicationStatus.value.state).toBe("waiting");
    await flushPublication();
    expect(result?.publicationStatus.value).toEqual({
      state: "active",
      message: "Published WebMCP tools.",
    });

    await result?.retryPublication();
    expect(waitForWebMcpDriver).toHaveBeenCalledOnce();
    expect(synchronizeWebMcpTools).toHaveBeenCalledOnce();

    scope.stop();
    expect(disposePublication).toHaveBeenCalledOnce();
  });

  it("retries after the bounded driver wait finds no driver", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    vi.mocked(waitForWebMcpDriver)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(driver);
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    await flushPublication();
    expect(result?.publicationStatus.value.state).toBe("unavailable");

    await result?.retryPublication();
    expect(result?.publicationStatus.value.state).toBe("active");
    expect(waitForWebMcpDriver).toHaveBeenCalledTimes(2);
    expect(synchronizeWebMcpTools).toHaveBeenCalledOnce();

    scope.stop();
  });

  it("reports publication failure and retries from a clean attempt", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    vi.mocked(waitForWebMcpDriver).mockResolvedValue(driver);
    vi.mocked(synchronizeWebMcpTools)
      .mockRejectedValueOnce(new Error("registration failed"))
      .mockResolvedValueOnce({
        message: "Published WebMCP tools.",
        dispose: disposePublication,
      });
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    await flushPublication();
    expect(result?.publicationStatus.value).toEqual({
      state: "failed",
      message: "WebMCP publication failed: registration failed",
    });

    await result?.retryPublication();
    expect(result?.publicationStatus.value.state).toBe("active");
    expect(synchronizeWebMcpTools).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it("does not overwrite a startup failure with an active status", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    vi.mocked(waitForWebMcpDriver).mockResolvedValue(driver);
    vi.mocked(synchronizeWebMcpTools)
      .mockImplementationOnce(async (_driver, options) => {
        options?.onError?.(new Error("synchronous registration failed"));
        return {
          message: "No live tools remain.",
          dispose: disposePublication,
        };
      })
      .mockResolvedValueOnce({
        message: "Published WebMCP tools.",
        dispose: disposePublication,
      });
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    await flushPublication();
    expect(result?.publicationStatus.value).toEqual({
      state: "failed",
      message: "WebMCP publication failed: synchronous registration failed",
    });
    expect(disposePublication).toHaveBeenCalledOnce();

    await result?.retryPublication();
    expect(result?.publicationStatus.value.state).toBe("active");
    expect(synchronizeWebMcpTools).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it("disposes while driver discovery is pending without starting publication", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    let waitSignal: AbortSignal | undefined;
    let resolveDriver: (driver: WebMcpDriver | undefined) => void = () => {};
    vi.mocked(waitForWebMcpDriver).mockImplementation(
      async (_timeout, signal) => {
        waitSignal = signal;
        return await new Promise<WebMcpDriver | undefined>((resolve) => {
          resolveDriver = resolve;
        });
      }
    );
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    scope.stop();
    expect(waitSignal?.aborted).toBe(true);
    expect(result?.publicationStatus.value.state).toBe("disposed");

    resolveDriver(driver);
    await flushPublication();
    expect(synchronizeWebMcpTools).not.toHaveBeenCalled();
    expect(disposeRuntime).toHaveBeenCalledOnce();
  });

  it("shares a pending publication attempt and disposes its late result", async () => {
    vi.stubGlobal("__AYME_WEBMCP_PUBLISH__", true);
    const driver = { registerTool: vi.fn() };
    vi.mocked(waitForWebMcpDriver).mockResolvedValue(driver);
    let resolvePublication: (
      registration: Awaited<ReturnType<typeof synchronizeWebMcpTools>>
    ) => void = () => {};
    vi.mocked(synchronizeWebMcpTools).mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolvePublication = resolve;
        })
    );
    const scope = effectScope();

    const result = scope.run(() => useAymeWebMcp({ page }));
    await flushPublication();
    const retry = result?.retryPublication();
    expect(synchronizeWebMcpTools).toHaveBeenCalledOnce();

    scope.stop();
    const synchronizationOptions = vi.mocked(synchronizeWebMcpTools).mock
      .calls[0]?.[1];
    expect(synchronizationOptions?.signal?.aborted).toBe(true);

    resolvePublication({
      message: "Published WebMCP tools.",
      dispose: disposePublication,
    });
    await retry;
    expect(disposePublication).toHaveBeenCalledOnce();
    expect(result?.publicationStatus.value.state).toBe("disposed");
  });
});
