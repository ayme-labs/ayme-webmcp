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

type RecordingDriver = {
  tools: PublishedTool[];
};

type ListActions = {
  addItem(text: string): Promise<void>;
  archiveItem(index: number): Promise<void>;
  renameItem(index: number, text: string): Promise<void>;
};

const initialToolNames = [
  "get_page_state",
  "ListPage.addItem",
  "ListPage.items.archive",
  "ListPage.items.rename",
];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const publishedTools: PublishedTool[] = [];
    const driver: RecordingDriver & {
      registerTool(
        tool: PublishedTool,
        options: { signal: AbortSignal }
      ): Promise<void>;
    } = {
      tools: publishedTools,
      async registerTool(tool, { signal }) {
        publishedTools.push(tool);
        signal.addEventListener(
          "abort",
          () => {
            const index = publishedTools.indexOf(tool);
            if (index >= 0) publishedTools.splice(index, 1);
          },
          { once: true }
        );
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: false,
      value: driver,
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
      const tool = (
        document.modelContext as unknown as RecordingDriver
      ).tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`${name} WebMCP tool was not published.`);
      return await tool.execute(args);
    },
    { args, name }
  );

  expect(result).toEqual({ ok: true });
}

async function recordedTools(page: Page) {
  return await page.evaluate(() =>
    (document.modelContext as unknown as RecordingDriver).tools.map((tool) => ({
      description: tool.description,
      inputSchema: tool.inputSchema,
      name: tool.name,
    }))
  );
}

async function recordedToolNames(page: Page) {
  return (await recordedTools(page)).map((tool) => tool.name);
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

test("publishes the current page as ref-bearing ARIA state", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(async () =>
      (await recordedToolNames(page)).includes("get_page_state")
    )
    .toBe(true);

  const result = await page.evaluate(async () => {
    const tool = (
      document.modelContext as unknown as RecordingDriver
    ).tools.find((candidate) => candidate.name === "get_page_state");
    if (!tool) throw new Error("get_page_state WebMCP tool was not published.");
    return {
      hasPomIdentity: "pomId" in tool,
      snapshot: await tool.execute({}),
    };
  });

  expect(result.hasPomIdentity).toBe(false);
  const { snapshot } = result;
  expect(typeof snapshot).toBe("string");
  if (typeof snapshot !== "string") return;

  const archiveRefs = [
    ...snapshot.matchAll(/\[ref=(e\d+)\] button "Archive item-[12]"/g),
  ].map((match) => match[1]);
  expect(archiveRefs).toHaveLength(2);
  expect(new Set(archiveRefs).size).toBe(2);
  expect(snapshot).toMatch(
    /- \[ref=e\d+\] listitem:\n\s+- \/pom: "ListPage\.items\[0\]"/
  );
  expect(snapshot).toMatch(
    /- \[ref=e\d+\] listitem:\n\s+- \/pom: "ListPage\.items\[1\]"/
  );
  expect(snapshot).not.toContain("/pom: ListPage.archiveDialog");
});

test("shows the app model and page state in separate inspector tabs", async ({
  page,
}) => {
  await page.goto("/");

  const appModelTab = page.getByRole("tab", { name: "App Model" });
  const pageStateTab = page.getByRole("tab", { name: "Page State" });
  await expect(appModelTab).toHaveAttribute("aria-selected", "true");

  await pageStateTab.click();

  const pageStatePanel = page.locator("#page-state-panel");
  const output = pageStatePanel.locator(".page-state-output");
  await expect(pageStatePanel).toBeVisible();
  await expect(output).toContainText("[ref=");
  await expect(output).toContainText('/pom: "ListPage.items[0]"');
  await expect(output).not.toContainText("POM inspector");
  await expect(pageStateTab).toHaveAttribute("aria-selected", "true");

  await pageStatePanel.getByRole("button", { name: "Refresh" }).click();
  await expect(output).toContainText('/pom: "ListPage.items[1]"');
});

test("runs the same POM behavior through registered WebMCP tools", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(async () => await recordedToolNames(page))
    .toEqual(initialToolNames);

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

test("publishes collection tools only while a component root is live", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(async () => await recordedToolNames(page))
    .toEqual(initialToolNames);

  await executePublishedTool(page, "ListPage.items.archive", {
    index: 0,
    args: {},
  });
  await executePublishedTool(page, "ListPage.items.archive", {
    index: 0,
    args: {},
  });
  await expect
    .poll(async () => await recordedToolNames(page))
    .toEqual(["get_page_state", "ListPage.addItem"]);

  await executePublishedTool(page, "ListPage.addItem", {
    text: "Restore live component tools",
  });
  await expect
    .poll(async () => await recordedToolNames(page))
    .toEqual(initialToolNames);
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
    .poll(async () => await recordedToolNames(page))
    .toEqual(initialToolNames);

  const tools = await recordedTools(page);

  expect(tools).toEqual([
    {
      name: "get_page_state",
      description:
        "Return the top-level structural page state, decorated with root POM labels. Real nodes use Playwright refs; synthetic POM roots use observation-only synthetic refs. Capture is limited to the top-level document.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
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
    const tool = (
      document.modelContext as unknown as RecordingDriver
    ).tools.find((candidate) => candidate.name === "ListPage.items.archive");
    if (!tool) throw new Error("Archive WebMCP tool was not published.");
    try {
      await tool.execute({ index: -1, args: { unexpected: true } });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Invalid collection tool input was accepted.");
  });

  expect(invalidToolInputError).toContain("index must be at least 0");

  await executePublishedTool(page, "ListPage.items.archive", {
    index: 0,
    args: {},
  });
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
