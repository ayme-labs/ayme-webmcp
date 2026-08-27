import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import App from "./App.vue";

describe("The example application", () => {
  it("renders the WebMCP heading", () => {
    expect(mount(App).get("h1").text()).toBe("Ayme WebMCP");
  });
});
