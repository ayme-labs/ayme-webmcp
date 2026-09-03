import type { Locator } from "@playwright/test";

export class ArchiveDialog {
  readonly root: Locator;
  readonly confirmArchiveButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.confirmArchiveButton = root.getByRole("button", {
      name: "Confirm archive",
    });
  }

  async confirm() {
    await this.root.waitFor({ state: "visible" });
    await this.confirmArchiveButton.click();
    await this.root.waitFor({ state: "hidden", timeout: 250 });
  }
}
