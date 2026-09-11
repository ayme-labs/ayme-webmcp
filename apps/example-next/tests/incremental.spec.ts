import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const counterModePath = fileURLToPath(
  new URL("../playwright/pom/CounterMode.ts", import.meta.url)
);

test("rebuilds POM metadata from an imported type without restarting Next", async ({
  page,
}) => {
  const original = await readFile(counterModePath, "utf8");
  const changed = original.replace('"double"', '"triple"');
  expect(changed).not.toBe(original);

  await page.goto("/");
  await expect(page.getByTestId("compiled-metadata")).toContainText('"double"');

  try {
    await writeFile(counterModePath, changed);
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("compiled-metadata").textContent();
        },
        { timeout: 30_000, intervals: [250, 500, 1_000] }
      )
      .toContain('"triple"');
  } finally {
    await writeFile(counterModePath, original);
  }
});
