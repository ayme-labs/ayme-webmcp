import { getPageStateTool } from "./pageState";
import { listRegisteredPomTools } from "./registry";

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

  await modelContext.registerTool(getPageStateTool);
  const pomTools = listRegisteredPomTools();
  for (const tool of pomTools) {
    await modelContext.registerTool(tool);
  }

  return {
    registered: true,
    message: `Registered ${pomTools.length + 1} WebMCP tools.`,
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
