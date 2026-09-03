/**
 * Package-local replacements for Playwright's tests/config/utils.
 *
 * Provides the utility functions imported by upstream spec files through
 * the relative path ../config/utils. These are infrastructure helpers,
 * not compatibility operations.
 */
import type { Frame, Page } from "@playwright/test";

export async function attachFrame(
  page: Page,
  frameId: string,
  url: string
): Promise<Frame> {
  const handle = await page.evaluateHandle(
    async ({ frameId, url }) => {
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.id = frameId;
      document.body.appendChild(frame);
      await new Promise((resolve) => (frame.onload = resolve));
      return frame;
    },
    { frameId, url }
  );
  const element = handle.asElement()!;
  return (await element.contentFrame())!;
}

export async function detachFrame(page: Page, frameId: string): Promise<void> {
  await page.evaluate((frameId) => {
    document.getElementById(frameId)?.remove();
  }, frameId);
}

export async function rafraf(target: Page | Frame, count = 1) {
  for (let i = 0; i < count; i++) {
    await target.evaluate(
      async () =>
        new Promise((f) =>
          requestAnimationFrame(() => requestAnimationFrame(f))
        )
    );
  }
}

export function expectedSSLError(browserName: string): string {
  if (browserName === "chromium") return "net::ERR_CERT_AUTHORITY_INVALID";
  if (browserName === "webkit")
    return "The certificate for this server is invalid";
  return "SEC_ERROR_UNKNOWN_ISSUER";
}

export function unshift<T>(array: T[], ...items: T[]): void {
  array.unshift(...items);
}
