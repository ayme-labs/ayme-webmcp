import type { Locator, Page } from "@playwright/test";

import { WebMCP } from "./webmcp";

@WebMCP
export class SelectedCompatibilityPom {
  readonly button: Locator;

  constructor(private readonly page: Page) {
    this.button = page.getByRole("button");
  }

  @WebMCP.tool({ description: "Read the title." })
  title() {
    return this.page.title();
  }

  @WebMCP.tool({ description: "Use browser-emulated actions." })
  async act() {
    await this.button.fill("ready");
    await this.button.press("Enter");
    await this.button.click();
  }
}
