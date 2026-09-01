import { expect, test } from "./fixtures/test";
import {
  observeAbortCancellation,
  observeActionContracts,
  observeAccessibilityOutput,
  observeDefaultTimeout,
  observeDelayedReads,
  observeFinderFactories,
  observeHiddenAndDetachedWaits,
  observeLocatorComposition,
  observeInputEvents,
  observeLocatorReads,
  observeLocatorStates,
  observeNoImplicitDefaultTimeout,
  observePageObservation,
  observePerCallTimeout,
  observeStrictResolution,
} from "./fixtures/operations";
import { revealDelayedState } from "./fixtures/dom";
import { locatorReadDocument } from "./fixtures/document";

test("matches finder factories and lazy descendant composition in Chromium", async ({
  parity,
}) => {
  await parity.reset(`
    <!doctype html>
    <main id="finder-root">
      <section data-testid="profile-card" title="Profile details">
        <img alt="Profile photo" />
        <label for="name">Username</label>
        <input id="name" placeholder="Your username" />
        <button aria-label="Save profile">Save</button>
        <p>Unique finder text</p>
      </section>
    </main>`);

  await expect(parity.run(observeFinderFactories)).resolves.toEqual({
    altText: 1,
    exactAltText: 0,
    label: 1,
    placeholder: 1,
    role: 1,
    testId: 1,
    text: 1,
    title: 1,
    descendantRole: 1,
    descendantLocator: 1,
    locatorOptions: 1,
    locatorHas: 1,
    locatorHasNot: 1,
    lazy: 1,
  });
});

test("observes the shared BrowserPage parity fixtures in Chromium", async ({
  parity,
}) => {
  const strict = await parity.run(observeStrictResolution);
  expect(strict).toEqual({
    singleCount: 1,
    multipleCount: 2,
    multipleClickRejected: true,
    multipleWaitRejected: true,
  });

  await revealDelayedState(parity.page, 40);
  const visibleState = await parity.run(observeDefaultTimeout);
  expect(visibleState.elapsedMs).toBeGreaterThanOrEqual(20);
  expect(visibleState.elapsedMs).toBeLessThan(1_000);
  expect(visibleState.count).toBe(1);

  const timeout = await parity.run(observePerCallTimeout);
  expect(timeout.outcome).toBe("timeout");
  expect(timeout.elapsedMs).toBeLessThan(250);

  const abort = await parity.run(observeAbortCancellation);
  expect(abort).toEqual({
    aborted: true,
    outcome: "cancelled",
    reason: "fixture cancellation",
  });

  const input = await parity.run(observeInputEvents);
  expect(input).toEqual({
    value: "hello",
    events: [
      "input",
      "change",
      "keydown:Enter",
      "keypress:Enter",
      "keyup:Enter",
    ],
  });

  const accessibility = await parity.run(observeAccessibilityOutput);
  expect(accessibility).toEqual({
    output:
      'main "Chromium parity fixture"\n  heading "Chromium parity fixture"\n  button "Save"',
    roles: { main: 1, heading: 1, saveButton: 1 },
  });

  await expect(
    parity.run(async (page) => await page.ariaSnapshot({ depth: 3 }))
  ).resolves.toBe(await parity.page.ariaSnapshot({ depth: 3 }));

  const composition = await parity.run(observeLocatorComposition);
  expect(composition).toEqual({
    hasBadge: 2,
    hasNotBadge: 2,
    hasText: 1,
    hasNotText: 3,
    hasTextRegex: 1,
    and: 1,
    or: 2,
    first: 1,
    last: 1,
    nth: 1,
    negativeNth: 1,
    allCount: 3,
    postInsertionCount: 4,
    clicked: ["alpha", "inserted"],
  });

  const observation = await parity.run(observePageObservation);
  expect(observation).toEqual({
    contentHasDoctype: true,
    defaultTimeoutElapsedMs: expect.any(Number),
    defaultTimeoutEnforced: true,
    defaultSnapshotHasMain: true,
    hasDeterministicBox: true,
    hasRef: true,
    title: "Chromium parity fixture",
    url: "about:blank",
  });
  expect(observation.defaultTimeoutElapsedMs).toBeLessThan(250);
});

test("observes locator reads and state predicates in Chromium", async ({
  parity,
}) => {
  await parity.reset(locatorReadDocument);

  expect(await parity.run(observeLocatorReads)).toEqual({
    allInnerTexts: ["First Visible", "Second Visible"],
    allTextContents: ["First DOM-only Visible", "Second Visible"],
    attribute: "rendered-text",
    html: "<strong>Markup</strong>",
    innerText: "Rendered",
    inputValue: "from-control",
    scalarStrict: true,
    textContent: "Rendered DOM-only",
  });

  expect(await parity.run(observeLocatorStates)).toEqual({
    checked: true,
    unchecked: false,
    ariaChecked: true,
    inheritedDisabled: true,
    ariaDisabled: true,
    enabled: true,
    editable: true,
    readonly: false,
    contentEditable: true,
    visible: true,
    hidden: true,
    displayNone: false,
    visibilityHidden: true,
    missingVisible: false,
    missingHidden: true,
  });
});

test("runs Locator actions through the explicit browser-emulation contract", async ({
  parity,
}) => {
  const actions = await parity.run(observeActionContracts);

  expect(actions).toEqual({
    buttonEvents: ["click"],
    buttonTrusted: [false],
    hiddenClicks: 1,
    inputEvents: [
      "input",
      "change",
      "keydown:Enter",
      "keypress:Enter",
      "keyup:Enter",
    ],
    inputTrusted: [false, false, false, false, false],
    inputValue: "hello",
    liveTarget: { oldClicked: false, newClicked: true },
    navigatedToHash: "#navigated",
    submits: 1,
  });
});

test("matches Playwright Page content and AI snapshot no-match behavior", async ({
  parity,
}) => {
  await parity.reset(
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html><head><title>Serialized</title></head><body></body></html>`
  );

  await expect(parity.run(async (page) => await page.content())).resolves.toBe(
    await parity.page.content()
  );

  await parity.page.evaluate(() => {
    setTimeout(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="playwright-late"></div>'
      );
    }, 30);
  });
  await expect(
    parity.page
      .locator("#playwright-late")
      .ariaSnapshot({ mode: "ai", timeout: 200 })
  ).rejects.toThrow("does not match any element");

  const runtimeResult = await parity.run(async (page) => {
    setTimeout(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="runtime-late"></div>'
      );
    }, 30);
    try {
      await page
        .locator("#runtime-late")
        .ariaSnapshot({ mode: "ai", timeout: 200 });
      return "resolved";
    } catch {
      return "rejected";
    }
  });
  expect(runtimeResult).toBe("rejected");
});

test("retries matched scalar reads and honors timeout and cancellation", async ({
  parity,
}) => {
  expect(await parity.run(observeDelayedReads)).toEqual({
    abortError: { cause: "read cancellation", name: "AbortError" },
    reads: [
      "attribute",
      "<strong>markup</strong>",
      "inner text",
      "input value",
      "text content",
      true,
      true,
      true,
      true,
    ],
    timedOut: true,
  });
});

test("keeps Playwright's zero default timeout until configured", async ({
  parity,
}) => {
  const elapsedMs = await parity.run(observeNoImplicitDefaultTimeout);
  expect(elapsedMs).toBeGreaterThanOrEqual(1_000);
  expect(elapsedMs).toBeLessThan(2_500);
});

test("waits for hidden and detached locator states", async ({ parity }) => {
  await expect(parity.run(observeHiddenAndDetachedWaits)).resolves.toEqual({
    detached: true,
    hidden: true,
  });
});
