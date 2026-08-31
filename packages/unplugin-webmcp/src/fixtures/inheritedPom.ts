import type { BrowserLocator } from "@ayme-dev/webmcp";

import { WebMCP } from "./webmcp";

class BasePom {
  readonly inheritedButton!: BrowserLocator;

  @WebMCP.tool({ description: "Use the inherited tool." })
  inheritedTool(value: string) {
    return value;
  }
}

@WebMCP
export class InheritedPom extends BasePom {
  readonly ownButton!: BrowserLocator;
}
