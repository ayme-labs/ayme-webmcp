import { effectScope } from "vue";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createPageRegistration } from "@ayme-dev/webmcp/internal";
import { usePageObject } from "./index";

class FakePageObject {
  describe() {
    return "fake page object";
  }
}

const dispose = vi.fn();

vi.mock("@ayme-dev/webmcp/internal", () => ({
  createPageRegistration: vi.fn(),
}));

describe("usePageObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPageRegistration).mockReturnValue({
      instance: new FakePageObject(),
      dispose,
    });
  });

  it("activates once and returns the concrete page object type", () => {
    const scope = effectScope();
    const pageObject = scope.run(() => usePageObject(FakePageObject));

    if (!pageObject) throw new Error("The page object was not returned.");

    expectTypeOf(pageObject).toEqualTypeOf<FakePageObject>();
    expect(pageObject.describe()).toBe("fake page object");
    expect(createPageRegistration).toHaveBeenCalledTimes(1);
    expect(createPageRegistration).toHaveBeenCalledWith(FakePageObject);

    scope.stop();
  });

  it("disposes the registration exactly once when the scope ends", () => {
    const scope = effectScope();
    scope.run(() => usePageObject(FakePageObject));

    scope.stop();
    scope.stop();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
