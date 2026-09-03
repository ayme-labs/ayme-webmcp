/**
 * Package-local replacement for Playwright's tests/page/pageTest.ts.
 *
 * Routes all Page/Locator calls through the actual
 * @ayme-dev/playwright-browser createPage adapter running in the browser.
 * No calls fall back to the real Playwright driver.
 *
 * Upstream spec files import { test, expect } from './pageTest' unchanged.
 */
import {
  test as base,
  expect as baseExpect,
  type Page,
  type Frame,
} from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdapterPage } from "./adapter-bridge";
import { TestServer } from "./testServer";

const __fixtureDir = dirname(fileURLToPath(import.meta.url));

// ── Fixtures ────────────────────────────────────────────────────────

type ServerFixtures = {
  server: TestServer;
  httpsServer: TestServer;
  asset: (relativePath: string) => string;
};

type PlatformFixtures = {
  isWindows: boolean;
  isLinux: boolean;
  isMac: boolean;
  platform: "win32" | "linux" | "darwin";
  loopback: string;
};

type CompatFixtures = {
  browserMajorVersion: number;
  mode: string;
  isAndroid: boolean;
  isElectron: boolean;
  isBidi: boolean;
  isHeadlessShell: boolean;
  isFrozenWebkit: boolean;
  headless: boolean;
  toImpl: (object: unknown) => unknown;
};

export const test = base.extend<
  ServerFixtures & PlatformFixtures & CompatFixtures
>({
  // ── Adapter page ──────────────────────────────────────────────────
  // Wraps the real Playwright page with a proxy that routes all
  // compatibility operations through the in-browser adapter.
  page: async ({ page }, use) => {
    const proxyPage = await createAdapterPage(page);
    await use(proxyPage);
  },

  // ── Test server ───────────────────────────────────────────────────
  server: async ({}, use) => {
    const server = await TestServer.create();
    await use(server);
    await server.close();
  },

  httpsServer: async ({}, use) => {
    const server = await TestServer.createHTTPS();
    await use(server);
    await server.close();
  },

  asset: async ({}, use) => {
    const assetsDir = resolve(__fixtureDir, "../assets");
    await use((relativePath: string) => resolve(assetsDir, relativePath));
  },

  // ── Platform info ─────────────────────────────────────────────────
  isWindows: process.platform === "win32",
  isLinux: process.platform === "linux",
  isMac: process.platform === "darwin",
  platform: process.platform as "win32" | "linux" | "darwin",
  loopback: "localhost",

  // ── Compatibility stubs ───────────────────────────────────────────
  browserMajorVersion: async ({}, use) => {
    const version = process.env.PLAYWRIGHT_BROWSER_VERSION ?? "0";
    await use(parseInt(version, 10));
  },
  mode: "default",
  isAndroid: false,
  isElectron: false,
  isBidi: false,
  isHeadlessShell: false,
  isFrozenWebkit: false,
  headless: true,
  toImpl: async ({}, use) => {
    await use((obj: unknown) => obj);
  },
});

// ── Expect ──────────────────────────────────────────────────────────

export const expect = baseExpect.extend({
  toContainYaml(received: string, expected: string) {
    const trimmed = expected.split("\n").filter((a) => !!a.trim());
    const maxPrefixLength = Math.min(
      ...trimmed.map((line) => (line.match(/^\s*/) ?? [""])[0].length)
    );
    const trimmedExpected = trimmed
      .map((line) => line.substring(maxPrefixLength))
      .join("\n");
    try {
      if (this.isNot) expect(received).not.toContain(trimmedExpected);
      else expect(received).toContain(trimmedExpected);
      return { pass: !this.isNot, message: () => "" };
    } catch (e: unknown) {
      return {
        pass: this.isNot,
        message: () => (e instanceof Error ? e.message : String(e)),
      };
    }
  },
});

// ── Utilities ───────────────────────────────────────────────────────

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
