import type { Page } from "@playwright/test";

import { WebMCP } from "./webmcp";

@WebMCP
export class UnsupportedCompatibilityPom {
  constructor(private readonly page: Page) {}

  @WebMCP.tool({ description: "Navigate elsewhere." })
  navigate() {
    return this.page.goto("https://example.test");
  }
}
