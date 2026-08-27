import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { ListPage } from "../playwright/pom/ListPage";
import { derivePomManifests } from "@ayme-dev/unplugin-webmcp";

type PublishedTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  execute(args: unknown): Promise<unknown>;
};

type ListActions = {
  addItem(text: string): Promise<void>;
  archiveItem(index: number): Promise<void>;
  renameItem(index: number, text: string): Promise<void>;
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const publishedTools: PublishedTool[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: false,
      value: {
        async registerTool(tool: PublishedTool) {
          publishedTools.push(tool);
          window.__AYME_WEBMCP_TOOLS__ = publishedTools;
        },
      },
    });
    window.__AYME_DISABLE_RELAY__ = true;
  });
});

async function runListActions(
  page: Page,
  actions: ListActions,
  itemText: string
) {
  await actions.addItem(itemText);
  await expect(page.getByText(itemText, { exact: true })).toBeVisible();

  await actions.renameItem(0, "Prepare the launch notes");
  await expect(
    page.getByText("Prepare the launch notes", { exact: true })
  ).toBeVisible();

  await actions.archiveItem(0);
  await expect(
    page.getByText("Prepare the launch notes", { exact: true })
  ).toBeVisible();
  await expect(page.locator(".archived-label")).toHaveCount(1);
}

async function executePublishedTool(page: Page, name: string, args: unknown) {
  const result = await page.evaluate(
    async ({ args, name }) => {
      const tool = window.__AYME_WEBMCP_TOOLS__?.find(
        (candidate) => candidate.name === name
      );
      if (!tool) throw new Error(`${name} WebMCP tool was not published.`);
      return await tool.execute(args);
    },
    { args, name }
  );

  expect(result).toEqual({ ok: true });
}

test("derives nested object input schemas from POM action types", () => {
  const [manifest] = derivePomManifests(
    path.resolve("tests/fixtures/objectInputPom.ts")
  );

  expect(manifest?.tools).toEqual([
    {
      methodName: "archive",
      toolName: "ObjectInputPom.archive",
      description: "Archive with structured options.",
      inputSchema: {
        type: "object",
        properties: {
          options: {
            type: "object",
            properties: {
              reason: { type: "string", enum: ["obsolete", "duplicate"] },
              notification: {
                type: "object",
                properties: {
                  channel: { type: "string", enum: ["email", "in-app"] },
                  includeLink: { type: "boolean" },
                },
                required: ["channel"],
                additionalProperties: false,
              },
            },
            required: ["reason"],
            additionalProperties: false,
          },
        },
        required: ["options"],
        additionalProperties: false,
      },
      parameters: [
        {
          name: "options",
          optional: false,
          schema: {
            type: "object",
            properties: {
              reason: { type: "string", enum: ["obsolete", "duplicate"] },
              notification: {
                type: "object",
                properties: {
                  channel: { type: "string", enum: ["email", "in-app"] },
                  includeLink: { type: "boolean" },
                },
                required: ["channel"],
                additionalProperties: false,
              },
            },
            required: ["reason"],
            additionalProperties: false,
          },
        },
      ],
    },
  ]);
});

test("runs the WebMCP POM source through real Playwright", async ({ page }) => {
  await page.goto("/");
  const listPage = new ListPage(page);

  await runListActions(
    page,
    {
      addItem: async (text) => await listPage.addItem(text),
      archiveItem: async (index) => {
        const items = await listPage.items();
        const item = items[index];
        if (!item) throw new Error(`No list item exists at index ${index}.`);
        await item.archive();
      },
      renameItem: async (index, text) => {
        const items = await listPage.items();
        const item = items[index];
        if (!item) throw new Error(`No list item exists at index ${index}.`);
        await item.rename(text);
      },
    },
    "Added through Playwright"
  );
});

test("runs the same POM behavior through registered WebMCP tools", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.__AYME_WEBMCP_TOOLS__?.length)
    )
    .toBe(3);

  await runListActions(
    page,
    {
      addItem: async (text) =>
        await executePublishedTool(page, "ListPage.addItem", { text }),
      archiveItem: async (index) =>
        await executePublishedTool(page, "ListPage.items.archive", {
          index,
          args: {},
        }),
      renameItem: async (index, text) =>
        await executePublishedTool(page, "ListPage.items.rename", {
          index,
          args: { text },
        }),
    },
    "Added through WebMCP"
  );
});

test("demonstrates the list app and invokes the generated POM tools from the debug console", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "My list" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "POM inspector" })
  ).toBeVisible();
  const pomCard = page.locator('[data-pom-id="ListPage"]');
  const archiveDialogCard = page.locator('[data-pom-class="ArchiveDialog"]');
  const listItemCard = page.locator('[data-pom-class="ListItem"]');
  await expect(page.locator("[data-pom-class]")).toHaveCount(3);
  await expect(
    pomCard.locator('[data-member-name="newItemInput"]')
  ).toContainText("present");
  await expect(
    pomCard.locator('[data-member-name="addItemButton"]')
  ).toContainText("present");
  await expect(
    archiveDialogCard.locator('[data-member-name="root"]')
  ).toContainText("absent");
  await expect(pomCard.locator('[data-member-name="items"]')).toContainText(
    "2 components"
  );
  await expect(
    listItemCard.locator('[data-member-name="archiveButton"]')
  ).toContainText("present");
  await expect(
    listItemCard.locator('[data-member-name="nameButton"]')
  ).toContainText("present");
  await expect(
    listItemCard.locator('[data-member-name="nameInput"]')
  ).toContainText("absent");
  const itemInstances = listItemCard.locator('[data-instance-list="ListItem"]');
  await expect(itemInstances).not.toHaveAttribute("open", "");
  await expect(itemInstances.locator(".instances-heading")).toContainText(
    "2 instances"
  );
  await itemInstances.locator(".instances-heading").click();
  await expect(
    itemInstances.locator('[data-instance-path="ListPage.items[0]"]')
  ).toContainText("present");
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.__AYME_WEBMCP_TOOLS__?.length)
    )
    .toBe(3);

  const tools = await page.evaluate(() =>
    window.__AYME_WEBMCP_TOOLS__?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  );

  expect(tools).toEqual([
    {
      name: "ListPage.addItem",
      description: "Add a new item to the list.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    {
      name: "ListPage.items.archive",
      description: "Archive this list item.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "integer", minimum: 0 },
          args: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
        required: ["index", "args"],
        additionalProperties: false,
      },
    },
    {
      name: "ListPage.items.rename",
      description: "Rename this list item.",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "integer", minimum: 0 },
          args: {
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        required: ["index", "args"],
        additionalProperties: false,
      },
    },
  ]);

  await page.getByLabel("New item").fill("Write release notes");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(
    page.getByText("Write release notes", { exact: true })
  ).toBeVisible();

  const invalidToolInputError = await page.evaluate(async () => {
    const tool = window.__AYME_WEBMCP_TOOLS__?.find(
      (candidate) => candidate.name === "ListPage.items.archive"
    );
    if (!tool) throw new Error("Archive WebMCP tool was not published.");
    try {
      await tool.execute({ index: -1, args: { unexpected: true } });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Invalid collection tool input was accepted.");
  });

  expect(invalidToolInputError).toContain("index must be at least 0");

  const archiveResult = await page.evaluate(async () => {
    const tool = window.__AYME_WEBMCP_TOOLS__?.find(
      (candidate) => candidate.name === "ListPage.items.archive"
    );
    if (!tool) throw new Error("Archive WebMCP tool was not published.");
    return await tool.execute({ index: 0, args: {} });
  });

  expect(archiveResult).toEqual({ ok: true });
  await expect(
    page.getByText("Prepare launch notes", { exact: true })
  ).toBeVisible();
  await expect(page.locator(".archived-label")).toHaveCount(1);

  const addTool = page.locator('[data-tool-name="ListPage.addItem"]');
  await addTool.getByLabel("text").fill("Added from debug console");
  await addTool.getByRole("button", { name: "Invoke tool" }).click();
  await expect(
    page.getByText("Added from debug console", { exact: true })
  ).toBeVisible();
  await expect(page.locator(".execution-card").first()).toContainText(
    "page.getByRole("
  );

  const renameTool = page.locator('[data-tool-name="ListPage.items.rename"]');
  await renameTool.getByLabel("index").fill("0");
  await renameTool
    .getByLabel("args")
    .fill('{"text":"Renamed from debug console"}');
  await renameTool.getByRole("button", { name: "Invoke tool" }).click();
  await expect(
    page.getByText("Renamed from debug console", { exact: true })
  ).toBeVisible();

  const archiveTool = page.locator('[data-tool-name="ListPage.items.archive"]');
  await archiveTool.getByLabel("index").fill("0");
  await expect(archiveTool.getByLabel("args")).toHaveValue("{}");
  await archiveTool.getByRole("button", { name: "Invoke tool" }).click();
  await expect(page.locator(".archived-label")).toHaveCount(2);

  await page.getByRole("button", { name: "Archive item-3" }).click();
  await expect(
    page.getByRole("dialog", { name: "Archive item" })
  ).toBeVisible();
  await expect(
    archiveDialogCard.locator('[data-member-name="root"]')
  ).toContainText("present");
  await expect(
    archiveDialogCard.locator('[data-member-name="confirmArchiveButton"]')
  ).toContainText("present");
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.locator(".archived-label")).toHaveCount(3);
  await expect(
    archiveDialogCard.locator('[data-member-name="root"]')
  ).toContainText("absent");

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(
    page.getByText("Invoke a tool to see its execution here.")
  ).toBeVisible();
});
