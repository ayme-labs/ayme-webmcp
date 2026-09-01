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
  let multipleWaitRejected = false;

  try {
    await multiple.click();
  } catch {
    multipleClickRejected = true;
  }

  try {
    await multiple.waitFor({ state: "attached", timeout: 30 });
  } catch {
    multipleWaitRejected = true;
  }

  return {
    singleCount,
    multipleCount,
    multipleClickRejected,
    multipleWaitRejected,
  };
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
    .waitFor({ signal: controller.signal, state: "visible", timeout: 250 });

  controller.abort("fixture cancellation");
  let outcome: "cancelled" | "resolved" | "unexpected-error" = "resolved";
  try {
    await browserWait;
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

export async function observeActionContracts(page: BrowserPage) {
  const button = page.locator('[data-fixture="save"]');
  const buttonEvents: string[] = [];
  const buttonTrusted: boolean[] = [];
  const buttonElement = document.querySelector<HTMLElement>(
    '[data-fixture="save"]'
  );
  if (!buttonElement) throw new Error("The action button fixture is missing.");
  for (const type of [
    "pointerdown",
    "mousedown",
    "mouseup",
    "pointerup",
    "click",
  ])
    buttonElement.addEventListener(type, (event) => {
      buttonEvents.push(type);
      buttonTrusted.push(event.isTrusted);
    });

  const hidden = page.locator('[data-fixture="hidden-action"]');
  let hiddenClicks = 0;
  document
    .querySelector('[data-fixture="hidden-action"]')
    ?.addEventListener("click", () => {
      hiddenClicks += 1;
    });

  const input = page.locator("#message-input");
  const inputEvents: string[] = [];
  const inputTrusted: boolean[] = [];
  const inputElement =
    document.querySelector<HTMLInputElement>("#message-input");
  if (!inputElement) throw new Error("The action input fixture is missing.");
  for (const type of ["input", "change", "keydown", "keypress", "keyup"])
    inputElement.addEventListener(type, (event) => {
      inputEvents.push(
        type === "input" || type === "change"
          ? type
          : `${type}:${(event as KeyboardEvent).key}`
      );
      inputTrusted.push(event.isTrusted);
    });

  let submits = 0;
  inputElement.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submits += 1;
  });

  await button.click({ trial: true, force: true, noWaitAfter: false });
  await hidden.click({ force: false, trial: true });
  await input.fill("hello", { force: true, timeout: 1 });
  await input.press("Enter", { noWaitAfter: false, timeout: 1 });
  await page
    .locator('[data-fixture="navigate-action"]')
    .click({ noWaitAfter: false });

  const live = page.locator('[data-fixture="live-action"]');
  let oldClicked = false;
  let newClicked = false;
  const oldTarget = document.querySelector<HTMLElement>(
    '[data-fixture="live-action"]'
  );
  if (!oldTarget) throw new Error("The live action fixture is missing.");
  oldTarget.addEventListener("click", () => {
    oldClicked = true;
  });
  queueMicrotask(() => {
    const replacement = document.createElement("button");
    replacement.type = "button";
    replacement.dataset.fixture = "live-action";
    replacement.textContent = "New target";
    replacement.addEventListener("click", () => {
      newClicked = true;
    });
    oldTarget.replaceWith(replacement);
  });
  await live.click();

  return {
    buttonEvents,
    buttonTrusted,
    hiddenClicks,
    inputEvents,
    inputTrusted,
    inputValue: inputElement.value,
    liveTarget: { oldClicked, newClicked },
    navigatedToHash: location.hash,
    submits,
  };
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

export async function observeLocatorReads(page: BrowserPage) {
  const items = page.locator('[data-fixture="read-item"]');
  const renderedText = page.locator("#rendered-text");
  const duplicate = page.locator('[data-fixture="read-item"]');
  let scalarStrict = false;

  try {
    await duplicate.getAttribute("data-fixture");
  } catch {
    scalarStrict = true;
  }

  return {
    allInnerTexts: await items.allInnerTexts(),
    allTextContents: await items.allTextContents(),
    attribute: await renderedText.getAttribute("id"),
    html: await page.locator("#html-read").innerHTML(),
    innerText: await renderedText.innerText(),
    inputValue: await page.locator("#wrapped-label").inputValue(),
    scalarStrict,
    textContent: await renderedText.textContent(),
  };
}

export async function observeLocatorStates(page: BrowserPage) {
  return {
    checked: await page.locator("#checked").isChecked(),
    unchecked: await page.locator("#unchecked").isChecked(),
    ariaChecked: await page.locator("#aria-checked").isChecked(),
    inheritedDisabled: await page.locator("#inherited-disabled").isDisabled(),
    ariaDisabled: await page.locator("#aria-disabled").isDisabled(),
    enabled: await page.locator("#editable").isEnabled(),
    editable: await page.locator("#editable").isEditable(),
    readonly: await page.locator("#readonly").isEditable(),
    contentEditable: await page.locator("#contenteditable").isEditable(),
    visible: await page.locator("#visible").isVisible(),
    hidden: await page.locator("#hidden").isHidden(),
    displayNone: await page.locator("#display-none").isVisible(),
    visibilityHidden: await page.locator("#visibility-hidden").isHidden(),
    missingVisible: await page.locator("#missing").isVisible(),
    missingHidden: await page.locator("#missing").isHidden(),
  };
}

export async function observePageObservation(page: BrowserPage) {
  page.setDefaultTimeout(30);
  const defaultTimeoutStartedAt = performance.now();
  let defaultTimeoutEnforced = false;
  try {
    await page.locator('[data-fixture="never-visible"]').waitFor();
  } catch (error) {
    defaultTimeoutEnforced =
      error instanceof Error && error.message.startsWith("Timed out waiting");
  }
  const main = page.getByRole("main", { name: "Chromium parity fixture" });
  const defaultSnapshot = await page.ariaSnapshot({ depth: 1 });
  const aiSnapshot = await main.ariaSnapshot({
    boxes: true,
    depth: 1,
    mode: "ai",
  });
  const repeatedAiSnapshot = await main.ariaSnapshot({
    boxes: true,
    depth: 1,
    mode: "ai",
  });

  return {
    contentHasDoctype: (await page.content()).startsWith("<!DOCTYPE html>"),
    defaultTimeoutElapsedMs: Math.round(
      performance.now() - defaultTimeoutStartedAt
    ),
    defaultTimeoutEnforced,
    defaultSnapshotHasMain: defaultSnapshot.includes(
      'main "Chromium parity fixture"'
    ),
    hasDeterministicBox:
      aiSnapshot === repeatedAiSnapshot &&
      /\[box=-?\d+,-?\d+,\d+,\d+\]/.test(aiSnapshot),
    hasRef: aiSnapshot.includes("[ref=e"),
    title: await page.title(),
    url: page.url(),
  };
}
