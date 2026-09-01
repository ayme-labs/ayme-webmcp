import type { BrowserLocator, BrowserPage } from "@ayme-dev/playwright-browser";

export async function observeFinderFactories(page: BrowserPage) {
  const lateFinder = page.getByText("Added after construction");
  document
    .querySelector("main")
    ?.insertAdjacentHTML("beforeend", "<p>Added after construction</p>");

  return {
    altText: await page.getByAltText("photo").count(),
    exactAltText: await page.getByAltText("photo", { exact: true }).count(),
    label: await page.getByLabel("User").count(),
    placeholder: await page.getByPlaceholder("username").count(),
    role: await page.getByRole("button", { name: "Save" }).count(),
    testId: await page.getByTestId("profile-card").count(),
    text: await page.getByText("Unique finder").count(),
    title: await page.getByTitle("details").count(),
    descendantRole: await page
      .locator("#finder-root")
      .getByRole("button", { name: "Save" })
      .count(),
    descendantLocator: await page
      .locator("#finder-root")
      .locator("section")
      .count(),
    locatorOptions: await page
      .locator("section", { hasText: "finder text" })
      .count(),
    locatorHas: await page
      .locator("section", { has: page.getByText("Unique finder") })
      .count(),
    locatorHasNot: await page
      .locator("section", { hasNot: page.getByText("Missing finder") })
      .count(),
    lazy: await lateFinder.count(),
  };
}

export async function observeStrictResolution(page: BrowserPage) {
  const single: BrowserLocator = page.getByRole("button", { name: "Save" });
  const multiple: BrowserLocator = page.getByRole("button", {
    name: "Duplicate",
  });
  const singleCount = await single.count();
  const multipleCount = await multiple.count();
  let multipleClickRejected = false;

  try {
    await multiple.click();
  } catch {
    multipleClickRejected = true;
  }

  return { singleCount, multipleCount, multipleClickRejected };
}

export async function observeDefaultTimeout(page: BrowserPage) {
  const delayedState = page.getByRole("status", { name: "Ready" });
  const startedAt = performance.now();
  await delayedState.waitFor({ state: "visible" });

  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    count: await delayedState.count(),
  };
}

export async function observePerCallTimeout(page: BrowserPage) {
  const missingState = page.getByRole("status", {
    name: "Never visible",
  });
  const startedAt = performance.now();
  let outcome: "timeout" | "unexpected-error" | "resolved" = "resolved";

  try {
    await missingState.waitFor({ state: "visible", timeout: 30 });
  } catch (error) {
    outcome =
      error instanceof Error && error.message.startsWith("Timed out waiting")
        ? "timeout"
        : "unexpected-error";
  }

  return { elapsedMs: Math.round(performance.now() - startedAt), outcome };
}

export async function observeAbortCancellation(page: BrowserPage) {
  const controller = new AbortController();
  const browserWait = page
    .locator('[data-fixture="never-visible"]')
    .waitFor({ state: "visible", timeout: 250 });
  const pending = new Promise<void>((resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(controller.signal.reason),
      { once: true }
    );
  });

  controller.abort("fixture cancellation");
  let outcome: "cancelled" | "resolved" | "unexpected-error" = "resolved";
  try {
    await Promise.race([browserWait, pending]);
  } catch (error) {
    outcome =
      String(error) === "fixture cancellation"
        ? "cancelled"
        : "unexpected-error";
  }

  return {
    aborted: controller.signal.aborted,
    outcome,
    reason: String(controller.signal.reason),
  };
}

export async function observeInputEvents(page: BrowserPage) {
  const input = document.querySelector<HTMLInputElement>("#message-input");
  if (!input) throw new Error("The input event fixture is missing.");

  const events: string[] = [];
  input.addEventListener("input", () => events.push("input"));
  input.addEventListener("change", () => events.push("change"));
  input.addEventListener("keydown", (event) =>
    events.push(`keydown:${event.key}`)
  );
  input.addEventListener("keypress", (event) =>
    events.push(`keypress:${event.key}`)
  );
  input.addEventListener("keyup", (event) => events.push(`keyup:${event.key}`));

  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("hello");
  await message.press("Enter");

  return { value: input.value, events };
}

export async function observeAccessibilityOutput(page: BrowserPage) {
  const main = page.getByRole("main", { name: "Chromium parity fixture" });
  const heading = page.getByRole("heading", {
    name: "Chromium parity fixture",
  });
  const saveButton = page.getByRole("button", { name: "Save" });
  const mainElement = document.querySelector<HTMLElement>('main[role="main"]');
  const headingElement = document.querySelector<HTMLElement>("#fixture-title");
  const saveElement = document.querySelector<HTMLElement>(
    '[data-fixture="save"]'
  );
  if (!mainElement || !headingElement || !saveElement) {
    throw new Error("The accessibility fixture is missing.");
  }

  const accessibleName = (element: HTMLElement) => {
    const labelledBy = element.getAttribute("aria-labelledby");
    return labelledBy
      ? (element.ownerDocument
          .getElementById(labelledBy)
          ?.textContent?.trim() ?? "")
      : (element.textContent?.trim() ?? "");
  };

  return {
    output: [
      `${mainElement.getAttribute("role")} "${accessibleName(mainElement)}"`,
      `  heading "${accessibleName(headingElement)}"`,
      `  button "${accessibleName(saveElement)}"`,
    ].join("\n"),
    roles: {
      main: await main.count(),
      heading: await heading.count(),
      saveButton: await saveButton.count(),
    },
  };
}

export async function observeLocatorComposition(page: BrowserPage) {
  const cards = page.locator('[data-fixture="composition-card"]');
  const badges = page.locator('[data-fixture="composition-badge"]');
  const alpha = page.locator('[data-card="alpha"]');
  const gamma = page.locator('[data-card="gamma"]');

  const selected = alpha.or(gamma);
  const selectedAll = await selected.all();
  const clicked: string[] = [];
  document.body.addEventListener("click", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-fixture="composition-card"]'
    );
    if (card) clicked.push(card.dataset.card ?? "missing");
  });
  await selectedAll[0].locator("button").click();

  const allCards = await cards.all();
  const inserted = document.createElement("article");
  inserted.dataset.fixture = "composition-card";
  inserted.dataset.card = "inserted";
  inserted.innerHTML = '<button type="button">Inserted action</button>';
  document.querySelector('[data-card="alpha"]')?.before(inserted);

  await allCards[0].locator("button").click();

  return {
    hasBadge: await cards.filter({ has: badges }).count(),
    hasNotBadge: await cards.filter({ hasNot: badges }).count(),
    hasText: await cards.filter({ hasText: "alpha" }).count(),
    hasNotText: await cards.filter({ hasNotText: "beta" }).count(),
    hasTextRegex: await cards.filter({ hasText: /GAMMA/i }).count(),
    and: await cards.and(page.locator('[data-card="beta"]')).count(),
    or: await selected.count(),
    first: await cards.first().count(),
    last: await cards.last().count(),
    nth: await cards.nth(1).count(),
    negativeNth: await cards.nth(-1).count(),
    allCount: allCards.length,
    postInsertionCount: await cards.count(),
    clicked,
  };
}
