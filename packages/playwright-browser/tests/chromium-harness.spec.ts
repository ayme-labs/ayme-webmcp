import { expect, test } from "./fixtures/test";
import {
  observeAbortCancellation,
  observeAccessibilityOutput,
  observeDefaultTimeout,
  observeInputEvents,
  observePerCallTimeout,
  observeStrictResolution,
} from "./fixtures/operations";
import { revealDelayedState } from "./fixtures/dom";

test("observes the shared BrowserPage parity fixtures in Chromium", async ({
  parity,
}) => {
  const strict = await parity.run(observeStrictResolution);
  expect(strict).toEqual({
    singleCount: 1,
    multipleCount: 2,
    multipleClickRejected: true,
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
});
