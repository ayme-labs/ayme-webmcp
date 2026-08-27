import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ListDemo from "./demo/ListDemo.vue";

describe("The example application", () => {
  it("adds, renames, and archives list items", async () => {
    const wrapper = mount(ListDemo);

    await wrapper.get("#new-item").setValue("Write the release notes");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("Write the release notes");

    await wrapper.get('[data-action="rename"]').trigger("click");
    await wrapper
      .get('[aria-label="Item name"]')
      .setValue("Prepare the launch notes");
    await wrapper.get('[aria-label="Item name"]').trigger("keyup.enter");
    expect(wrapper.text()).toContain("Prepare the launch notes");

    await wrapper.get('[aria-label="Archive item-1"]').trigger("click");
    await wrapper.get('[role="dialog"] .primary-button').trigger("click");
    expect(wrapper.get(".archived-label").text()).toBe("Archived");
  });
});
