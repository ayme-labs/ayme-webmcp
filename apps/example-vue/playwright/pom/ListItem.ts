import { WebMCP } from "@ayme-dev/webmcp";
import type { Locator } from "playwright";
import type { ArchiveDialog } from "./ArchiveDialog";

@WebMCP
export class ListItem {
  readonly root: Locator;
  readonly archiveButton: Locator;
  readonly nameButton: Locator;
  readonly nameInput: Locator;

  constructor(
    root: Locator,
    private readonly archiveDialog: ArchiveDialog
  ) {
    this.root = root;
    this.archiveButton = root.locator('[data-action="archive"]');
    this.nameButton = root.locator('[data-action="rename"]');
    this.nameInput = root.getByRole("textbox", { name: "Item name" });
  }

  @WebMCP.tool({
    description: "Archive this list item.",
  })
  async archive() {
    await this.archiveButton.click();
    await this.archiveDialog.confirm();
  }

  @WebMCP.tool({
    description: "Rename this list item.",
  })
  async rename(text: string) {
    await this.nameButton.click();
    await this.nameInput.fill(text);
    await this.nameInput.press("Enter");
  }
}
