import type { Locator } from "@playwright/test";

import { WebMCP } from "./webmcp";

@WebMCP
export class UnselectedCompatibilityPom {
  constructor(private readonly button: Locator) {}

  @WebMCP.tool({ description: "Return the owning page." })
  page() {
    return this.button.page();
  }
}
