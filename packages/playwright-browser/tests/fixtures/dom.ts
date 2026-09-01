import type { Page } from "@playwright/test";

export type DomMutation = {
  delayMs: number;
  hidden: boolean;
  selector: string;
};

export async function scheduleDomMutation(page: Page, mutation: DomMutation) {
  await page.evaluate(({ delayMs, hidden, selector }) => {
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.hidden = hidden;
    }, delayMs);
  }, mutation);
}

export function revealDelayedState(page: Page, delayMs = 40) {
  return scheduleDomMutation(page, {
    delayMs,
    hidden: false,
    selector: '[data-fixture="delayed-state"]',
  });
}
