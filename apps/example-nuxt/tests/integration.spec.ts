import { expect, test } from "@playwright/test";
import { CounterPage } from "../playwright/pom/CounterPage";

// Run the same contract against nuxt dev and the built Nitro server.
test.describe("server render", () => {
  test.use({ javaScriptEnabled: false });

  test("returns the Ayme subtree without browser registration on repeated requests", async ({
    page,
  }) => {
    for (let request = 0; request < 2; request += 1) {
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Ayme Nuxt prototype" })
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Counter" })).toBeVisible();
      await expect(page.locator("output")).toHaveText("0");
      await expect(
        page.getByRole("status", { name: "Publication" })
      ).toHaveText("Publication: waiting");
      await expect(
        page.getByRole("button", { name: "Call Page Object" })
      ).toBeVisible();
      await expect(page.getByTestId("registration-count")).toHaveText("0");
    }
  });
});

test("hydrates, publishes, executes the compiled POM, and cleans up on remount", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration.*mismatch/i.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool() {} },
    });
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("status", { name: "Publication" })).toHaveText(
    "Publication: active",
    { timeout: 15_000 }
  );
  await expect(page.getByTestId("registration-count")).toHaveText("1");
  await expect(page.getByTestId("compiled-metadata")).toContainText(
    "CounterPage.increment"
  );
  await expect(page.locator("output")).toHaveText("0");

  await page.getByRole("button", { name: "Call Page Object" }).click();
  await expect(page.locator("output")).toHaveText("1");
  await new CounterPage(page).increment();
  await expect(page.locator("output")).toHaveText("2");

  await page.getByRole("button", { name: "Unmount counter" }).click();
  await expect(page.getByRole("region", { name: "Counter" })).toHaveCount(0);
  await expect(page.getByTestId("registration-count")).toHaveText("0");
  await page
    .getByRole("button", { name: "Mount counter", exact: true })
    .click();
  await expect(page.getByTestId("registration-count")).toHaveText("1");
  await expect(page.locator("output")).toHaveText("0");
  await page.getByRole("button", { name: "Call Page Object" }).click();
  await expect(page.locator("output")).toHaveText("1");
  expect(errors).toEqual([]);
});
