export type WebMcpToolOptions = {
  description?: string;
};

function markWebMcpClass(target: object) {
  void target;
}

function markWebMcpTool(options: WebMcpToolOptions = {}): MethodDecorator {
  void options;
  return () => {};
}

export const WebMCP = Object.assign(markWebMcpClass, {
  tool: markWebMcpTool,
});
