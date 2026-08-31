import type { Locator } from "@playwright/test";

import { WebMCP } from "./webmcp";

class BaseCompatibilityPom {
  constructor(protected readonly button: Locator) {}

  @WebMCP.tool({ description: "Hover the button." })
  hover() {
    return this.button.hover();
  }
}

@WebMCP
export class InheritedCompatibilityPom extends BaseCompatibilityPom {}
