import { expect, test } from "@playwright/test";
import { CounterPage } from "../playwright/pom/CounterPage";

// These tests run unchanged against next dev and the next build/next start app.
test.describe("server shell", () => {
  test.use({ javaScriptEnabled: false });

  test("renders without constructing the browser runtime on the server", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Ayme Next.js prototype" })
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Counter" })).toHaveCount(0);
  });
});

test("uses the compiled POM in React and real Playwright, then remounts", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("status", { name: "Publication" })).toHaveText(
    "Publication: disabled"
  );
  await expect(page.locator("output")).toHaveText("0");
  // usePageObject rejects models without compiler-derived metadata. This call
  // therefore checks the actual loader, registration and browser action path.
  await page.getByRole("button", { name: "Call Page Object" }).click();
  await expect(page.locator("output")).toHaveText("1");

  await new CounterPage(page).increment();
  await expect(page.locator("output")).toHaveText("2");

  await page.getByRole("button", { name: "Unmount counter" }).click();
  await expect(page.getByRole("region", { name: "Counter" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mount counter", exact: true }).click();
  await expect(page.locator("output")).toHaveText("0");
  await page.getByRole("button", { name: "Call Page Object" }).click();
  await expect(page.locator("output")).toHaveText("1");
  expect(pageErrors).toEqual([]);
});
