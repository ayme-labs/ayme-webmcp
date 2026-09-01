import { test as base, expect } from "@playwright/test";

import { createChromiumHarness, type ChromiumHarness } from "../harness";

type Fixtures = {
  parity: ChromiumHarness;
};

export const test = base.extend<Fixtures>({
  parity: async ({ page }, use) => {
    await use(await createChromiumHarness(page));
  },
});

export { expect };
