import { describe, expect, it } from "vitest";

import ayme from "./index";
import { createPage } from "@ayme-dev/playwright-browser";
import { AriaRefSchema } from "@ayme-dev/core/structural-observation";
import {
  configureAymeRuntime,
  createAymeRuntime,
  createPageRegistration,
  registerCompiledPom,
} from "./internal";
import {
  listRegisteredPomTools,
  listRegisteredPoms,
  probeRegisteredPomMembers,
} from "./registry";

describe("the public Ayme page state facade in Chromium", () => {
  it("resolves live elements and retargets historical refs through replacements", async () => {
    document.body.innerHTML = '<button id="save">Save changes</button>';
    const originalState = await ayme.getPageState();
    const originalRef = structuralRefFor(originalState.text, "Save changes");
    const observedRefs = [originalRef];
    let previousElement = document.querySelector("#save");
    if (!previousElement) throw new Error("Expected the original button.");

    for (let replacement = 0; replacement < 3; replacement += 1) {
      const nextElement = document.createElement("button");
      nextElement.id = "save";
      nextElement.textContent = "Save changes";
      previousElement.replaceWith(nextElement);

      const currentState = await ayme.getPageState();
      const currentRef = structuralRefFor(currentState.text, "Save changes");
      expect(currentRef).not.toBe(observedRefs.at(-1));
      observedRefs.push(currentRef);
      previousElement = nextElement;
    }

    const latestRef = observedRefs.at(-1)!;
    const resolutions = await originalState.resolve(...observedRefs);
    expect(resolutions).toEqual(
      observedRefs.map((requestedRef) => ({
        status: "resolved",
        requestedRef,
        node: { ref: latestRef, element: previousElement },
      }))
    );

    previousElement.toggleAttribute("hidden", true);
    await expect(originalState.resolve(originalRef)).resolves.toEqual([
      {
        status: "unresolved",
        requestedRef: originalRef,
        reason: "removed",
      },
    ]);

    previousElement.toggleAttribute("hidden", false);
    await expect(originalState.resolve(originalRef)).resolves.toEqual([
      {
        status: "resolved",
        requestedRef: originalRef,
        node: { ref: latestRef, element: previousElement },
      },
    ]);

    previousElement.remove();
    await expect(originalState.resolve(originalRef)).resolves.toEqual([
      {
        status: "unresolved",
        requestedRef: originalRef,
        reason: "removed",
      },
    ]);

    document.body.append(previousElement);
    await expect(originalState.resolve(originalRef)).resolves.toEqual([
      {
        status: "resolved",
        requestedRef: originalRef,
        node: { ref: latestRef, element: previousElement },
      },
    ]);
  });

  it("clicks and fills refs from the captured page state", async () => {
    document.body.innerHTML = `
      <button id="save">Save changes</button>
      <label>Title <input id="title" /></label>
    `;
    configureAymeRuntime(createPage());
    const state = await ayme.getPageState();
    const buttonRef = structuralRefFor(state.text, "Save changes");
    const inputRef = structuralRefFor(state.text, "Title", "textbox");
    const button = document.querySelector<HTMLButtonElement>("#save");
    const input = document.querySelector<HTMLInputElement>("#title");
    if (!button || !input) throw new Error("Expected interaction controls.");
    let clicks = 0;
    let inputs = 0;
    button.addEventListener("click", () => (clicks += 1));
    input.addEventListener("input", () => (inputs += 1));

    await ayme.click(buttonRef);
    await ayme.fill(inputRef, "Updated title");

    expect(clicks).toBe(1);
    expect(input.value).toBe("Updated title");
    expect(inputs).toBeGreaterThan(0);
  });

  it("keeps collapsed root tools unavailable while retaining their definitions", async () => {
    document.body.innerHTML = `
        <aside id="sidebar" style="display: none; width: 240px; height: 120px">
          <button>Log out</button>
        </aside>
      `;
    const sidebar = document.querySelector("#sidebar");
    if (!sidebar) throw new Error("Expected the sidebar root.");
    let clicks = 0;
    sidebar.addEventListener("click", () => (clicks += 1));

    const page = createPage();
    const runtime = createAymeRuntime(page);
    class SidebarPage {
      readonly sidebar = {
        root: page.locator("#sidebar"),
        logout() {},
      };
    }
    registerCompiledPom(SidebarPage, {
      className: "SidebarPage",
      members: [
        {
          memberName: "sidebar",
          kind: "component",
          access: "field",
          componentClassName: "Sidebar",
          collection: false,
        },
      ],
      components: [
        {
          className: "Sidebar",
          members: [{ memberName: "root", kind: "locator", access: "field" }],
          tools: [
            {
              methodName: "logout",
              toolName: "Sidebar.logout",
              description: "Log out.",
              authoredDescription: "Log out.",
              inputSchema: {
                type: "object",
                properties: {},
                required: [],
                additionalProperties: false,
              },
              parameters: [],
              returnPoms: [],
            },
          ],
        },
      ],
      tools: [],
    });
    const registration = createPageRegistration(SidebarPage);

    await probeRegisteredPomMembers();
    expect(listRegisteredPomTools()).toEqual([]);
    await expect(
      ayme.getPageContext("SidebarPage", "Sidebar")
    ).resolves.toMatchObject({
      pomDefinitions: expect.arrayContaining([
        expect.objectContaining({
          name: "Sidebar",
          actions: expect.arrayContaining([
            expect.objectContaining({ name: "logout" }),
          ]),
        }),
      ]),
    });
    expect(clicks).toBe(0);

    sidebar.removeAttribute("style");
    await probeRegisteredPomMembers();
    expect(listRegisteredPoms()[0]?.memberObservations).toContainEqual(
      expect.objectContaining({
        memberName: "sidebar.root",
        kind: "component-root",
        count: 1,
        available: true,
      })
    );
    expect(listRegisteredPomTools().map(({ name }) => name)).toEqual([
      "SidebarPage.sidebar.logout",
    ]);
    expect(clicks).toBe(0);

    registration.dispose();
    runtime.dispose();
  });
});

function structuralRefFor(
  text: string,
  accessibleName: string,
  role = "button"
) {
  const escapedName = accessibleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ref = text.match(
    new RegExp(`(?:^|\\s)(e\\d+) ${role} "${escapedName}"`)
  )?.[1];
  if (!ref) throw new Error(`Expected a Structural Ref for ${accessibleName}.`);
  return AriaRefSchema.parse(ref);
}
