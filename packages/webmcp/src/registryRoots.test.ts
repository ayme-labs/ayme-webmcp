// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createBrowserPage } from "./browserPage";
import {
  configureAymeRuntime,
  createPageRegistration,
  listRegisteredPomRoots,
  registerCompiledPom,
} from "./registry";

describe("registered Page Object roots", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("emits only explicit roots with exactly one current-document match", async () => {
    document.body.innerHTML = `
      <div class="one"></div>
      <div class="many"></div>
      <div class="many"></div>
    `;
    const { page } = createBrowserPage();
    configureAymeRuntime(page);

    class ExamplePage {}
    registerCompiledPom(
      ExamplePage,
      {
        className: "ExamplePage",
        tools: [],
        members: [
          { memberName: "ignored", kind: "locator", access: "field" },
          {
            memberName: "zero",
            kind: "component",
            access: "field",
            componentClassName: "Root",
            collection: false,
          },
          {
            memberName: "one",
            kind: "component",
            access: "field",
            componentClassName: "Root",
            collection: false,
          },
          {
            memberName: "many",
            kind: "component",
            access: "field",
            componentClassName: "Root",
            collection: false,
          },
        ],
        components: [
          {
            className: "Root",
            members: [{ memberName: "root", kind: "locator", access: "field" }],
            tools: [],
          },
        ],
      },
      () => ({
        ignored: page.locator("body"),
        zero: { root: page.locator(".zero") },
        one: { root: page.locator(".one") },
        many: { root: page.locator(".many") },
      })
    );
    const registration = createPageRegistration(ExamplePage);

    await expect(listRegisteredPomRoots()).resolves.toEqual([
      {
        label: "ExamplePage.one",
        element: document.querySelector(".one"),
      },
    ]);

    registration.dispose();
  });
});
