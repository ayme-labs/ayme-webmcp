import type { Locator } from "@playwright/test";

import { WebMCP } from "./webmcp";

class GenericBaseCompatibilityPom<T extends Locator> {
  constructor(protected readonly button: T) {}

  @WebMCP.tool({ description: "Hover the button." })
  hover() {
    return this.button.hover();
  }
}

@WebMCP
export class GenericInheritedCompatibilityPom extends GenericBaseCompatibilityPom<Locator> {}
