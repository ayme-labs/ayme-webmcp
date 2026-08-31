import type { RegisteredTool } from "./contracts";
import { listRegisteredTools } from "./registry";

type ModelContext = {
  registerTool(tool: RegisteredTool): Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export type WebMcpRegistration = {
  registered: boolean;
  message: string;
};

export async function registerWebMcpTools(
  timeoutMs = 2_000
): Promise<WebMcpRegistration> {
  const modelContext = await waitForModelContext(timeoutMs);
  if (!modelContext) {
    return {
      registered: false,
      message: "document.modelContext is unavailable.",
    };
  }

  const tools = listRegisteredTools();
  for (const tool of tools) {
    await modelContext.registerTool(tool);
  }

  return {
    registered: true,
    message: `Registered ${tools.length} WebMCP tools.`,
  };
}

function waitForModelContext(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  return new Promise<ModelContext | undefined>((resolve) => {
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
