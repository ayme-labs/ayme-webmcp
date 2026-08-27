import { expect, test } from "@playwright/test";

test("shows the WebMCP heading", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Ayme WebMCP" })
  ).toBeVisible();
});
