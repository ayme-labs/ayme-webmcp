import { WebMCP } from "./webmcp";

@WebMCP
export class InvalidDecoratedToolPom {
  @WebMCP.tool({} as { description: string })
  run() {}
}
