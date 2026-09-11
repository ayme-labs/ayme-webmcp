import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const counterModePath = fileURLToPath(
  new URL("../playwright/pom/CounterMode.ts", import.meta.url)
);

test("recompiles POM metadata when an imported type changes", async ({
  page,
}) => {
  const original = await readFile(counterModePath, "utf8");
  const changed = original.replace('"double"', '"triple"');
  expect(changed).not.toBe(original);

  await page.goto("/");
  const metadata = page.getByTestId("compiled-metadata");
  await expect(metadata).toContainText('"double"');

  try {
    await writeFile(counterModePath, changed);
    await expect(metadata).toContainText('"triple"', { timeout: 30_000 });
    await expect(metadata).not.toContainText('"double"');
  } finally {
    await writeFile(counterModePath, original);
  }

  await expect(metadata).toContainText('"double"', { timeout: 30_000 });
});
