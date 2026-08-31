import type { BrowserLocator } from "@ayme-dev/webmcp";

import { WebMCP } from "./webmcp";

class BasePom {
  readonly inheritedButton!: BrowserLocator;
  declare readonly overriddenButton: BrowserLocator;
  private readonly basePrivateButton!: BrowserLocator;
  protected readonly baseProtectedButton!: BrowserLocator;

  @WebMCP.tool({ description: "Use the inherited base tool." })
  inheritedTool() {}

  @WebMCP.tool({ description: "Use the base override tool." })
  overriddenTool(value: string) {
    return value;
  }

  @WebMCP.tool({ description: "Do not expose the private base tool." })
  private basePrivateTool() {}

  @WebMCP.tool({ description: "Do not expose the protected base tool." })
  protected baseProtectedTool() {}
}

class MiddlePom extends BasePom {
  readonly middleButton!: BrowserLocator;
  override readonly overriddenButton: BrowserLocator =
    undefined as unknown as BrowserLocator;
  private readonly middlePrivateButton!: BrowserLocator;
  protected readonly middleProtectedButton!: BrowserLocator;

  @WebMCP.tool({ description: "Use the inherited middle tool." })
  middleTool() {}

  @WebMCP.tool({ description: "Use the middle override tool." })
  override overriddenTool(value: string) {
    return value;
  }
}

@WebMCP
export class MultiLevelInheritedPom extends MiddlePom {
  readonly ownButton!: BrowserLocator;
  override readonly overriddenButton: BrowserLocator =
    undefined as unknown as BrowserLocator;
  private readonly finalPrivateButton!: BrowserLocator;
  protected readonly finalProtectedButton!: BrowserLocator;

  @WebMCP.tool({ description: "Use the final override tool." })
  override overriddenTool(value: string) {
    return value;
  }
}
