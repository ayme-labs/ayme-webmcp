import type { RegisteredPomTool } from "./contracts";
import { getPageStateTool } from "./pageState";
import { listRegisteredPomTools, subscribeToRegisteredPoms } from "./registry";

type PublishedTool = RegisteredPomTool | typeof getPageStateTool;

export type WebMcpRegistration = {
  registered: boolean;
  message: string;
  dispose(): void;
};

export async function registerWebMcpTools(
  timeoutMs = 2_000
): Promise<WebMcpRegistration> {
  const modelContext = await waitForModelContext(timeoutMs);
  if (!modelContext) {
    return {
      registered: false,
      message: "document.modelContext is unavailable.",
      dispose() {},
    };
  }

  const published = new Map<
    string,
    { tool: PublishedTool; controller: AbortController }
  >();
  let disposed = false;
  let syncing = false;
  let syncAgain = false;

  const synchronize = async () => {
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    try {
      do {
        syncAgain = false;
        const active = new Map<string, PublishedTool>([
          [getPageStateTool.name, getPageStateTool],
          ...listRegisteredPomTools().map((tool) => [tool.name, tool] as const),
        ]);

        for (const [name, registration] of published) {
          const tool = active.get(name);
          if (tool === registration.tool) continue;
          registration.controller.abort();
          published.delete(name);
        }

        for (const [name, tool] of active) {
          if (disposed || published.has(name)) continue;
          const controller = new AbortController();
          published.set(name, { tool, controller });
          try {
            await modelContext.registerTool(tool, {
              signal: controller.signal,
            });
          } catch (error) {
            controller.abort();
            published.delete(name);
            throw error;
          }
        }
      } while (syncAgain && !disposed);
    } finally {
      syncing = false;
    }
  };

  const unsubscribe = subscribeToRegisteredPoms(() => {
    void synchronize().catch((error) => console.error(error));
  });
  await synchronize();

  return {
    registered: true,
    message: `Registered ${published.size} WebMCP tools and watching for changes.`,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const registration of published.values())
        registration.controller.abort();
      published.clear();
    },
  };
}

function waitForModelContext(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  return new Promise<typeof document.modelContext>((resolve) => {
    const check = () => {
      if (document.modelContext) {
        resolve(document.modelContext);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(undefined);
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}
