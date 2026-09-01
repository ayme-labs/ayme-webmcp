import type { Locator, Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import type {
  BrowserLocator,
  BrowserLocatorFilterOptions,
  BrowserPage,
  BrowserRole,
  BrowserRoleOptions,
  BrowserText,
  BrowserTextOptions,
  BrowserTestId,
} from "./browserPage";

type Expect<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Flatten<Value> = { [Key in keyof Value]: Value[Key] };

type PageFinderNames =
  | "getByAltText"
  | "getByLabel"
  | "getByPlaceholder"
  | "getByRole"
  | "getByTestId"
  | "getByText"
  | "getByTitle";

type BrowserPageFinderParameters = {
  [Name in PageFinderNames]: Parameters<BrowserPage[Name]>;
};

type BrowserLocatorFinderParameters = {
  [Name in PageFinderNames]: Parameters<BrowserLocator[Name]>;
};

type PlaywrightPageFinderParameters = {
  [Name in PageFinderNames]: Parameters<Page[Name]>;
};

type PlaywrightLocatorFinderParameters = {
  [Name in PageFinderNames]: Parameters<Locator[Name]>;
};

type _FinderParametersMatch = Expect<
  Equal<BrowserPageFinderParameters, PlaywrightPageFinderParameters>
>;
type _LocatorFinderParametersMatch = Expect<
  Equal<BrowserLocatorFinderParameters, PlaywrightLocatorFinderParameters>
>;
type _RoleMatches = Expect<
  Equal<BrowserRole, Parameters<Page["getByRole"]>[0]>
>;
type _RoleOptionsMatch = Expect<
  Equal<BrowserRoleOptions, NonNullable<Parameters<Page["getByRole"]>[1]>>
>;
type _TextMatches = Expect<
  Equal<BrowserText, Parameters<Page["getByText"]>[0]>
>;
type _TextOptionsMatch = Expect<
  Equal<BrowserTextOptions, NonNullable<Parameters<Page["getByText"]>[1]>>
>;
type _TestIdMatches = Expect<
  Equal<BrowserTestId, Parameters<Page["getByTestId"]>[0]>
>;
type ExpectedLocatorCompositionSignatures = {
  filter: (options?: BrowserLocatorFilterOptions) => BrowserLocator;
  and: (locator: BrowserLocator) => BrowserLocator;
  or: (locator: BrowserLocator) => BrowserLocator;
  first: () => BrowserLocator;
  last: () => BrowserLocator;
  nth: (index: number) => BrowserLocator;
  all: () => Promise<BrowserLocator[]>;
  count: () => Promise<number>;
};
type ExpectedFilterOptions = {
  has?: BrowserLocator;
  hasNot?: BrowserLocator;
  hasText?: string | RegExp;
  hasNotText?: string | RegExp;
  visible?: boolean;
};
type _LocatorCompositionSignaturesMatch = Expect<
  Equal<
    Pick<BrowserLocator, keyof ExpectedLocatorCompositionSignatures>,
    ExpectedLocatorCompositionSignatures
  >
>;
type _FilterOptionsMatch = Expect<
  Equal<Flatten<BrowserLocatorFilterOptions>, ExpectedFilterOptions>
>;
type LocatorReadSurface = Pick<
  Locator,
  | "allInnerTexts"
  | "allTextContents"
  | "getAttribute"
  | "innerHTML"
  | "innerText"
  | "inputValue"
  | "isChecked"
  | "isDisabled"
  | "isEditable"
  | "isEnabled"
  | "isHidden"
  | "isVisible"
  | "textContent"
>;

const locatorOptions: NonNullable<Parameters<Page["locator"]>[1]> = {
  has: {} as Locator,
  hasNot: {} as Locator,
  hasNotText: /absent/,
  hasText: "present",
};

const browserLocatorOptions: NonNullable<
  Parameters<BrowserPage["locator"]>[1]
> = {
  ...locatorOptions,
  has: {} as BrowserLocator,
  hasNot: {} as BrowserLocator,
};

describe("BrowserPage finder signatures", () => {
  it("mirror the pinned Playwright finder parameter types", () => {
    void (0 as unknown as _FinderParametersMatch);
    void (0 as unknown as _LocatorFinderParametersMatch);
    void (0 as unknown as _RoleMatches);
    void (0 as unknown as _RoleOptionsMatch);
    void (0 as unknown as _TextMatches);
    void (0 as unknown as _TextOptionsMatch);
    void (0 as unknown as _TestIdMatches);
    void (0 as unknown as _LocatorCompositionSignaturesMatch);
    void (0 as unknown as _FilterOptionsMatch);
    const locator = undefined as unknown as BrowserLocator;
    const playwrightReadSurface: LocatorReadSurface = locator;
    expect(playwrightReadSurface).toBe(locator);
    expect(
      Object.keys({ ...locatorOptions, ...browserLocatorOptions })
    ).toHaveLength(4);
  });
});
