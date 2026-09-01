import type { Locator, Page } from "@playwright/test";
import { describe, expect, it } from "vitest";

import type {
  BrowserLocator,
  BrowserLocatorFilterOptions,
  BrowserLocatorOptions,
  BrowserPage,
} from "./browserPage";

type Expect<Value extends true> = Value;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Flatten<Value> = { [Key in keyof Value]: Value[Key] };
type MethodShape<Source, Name extends keyof Source> = Source[Name] extends (
  ...args: infer Arguments
) => infer Result
  ? [arguments: Arguments, result: Result]
  : never;
type MethodShapes<Source, Names extends keyof Source> = {
  [Name in Names]: MethodShape<Source, Name>;
};

type CurrentSupport =
  (typeof import("./currentSupport").currentSupport)[number];
type MemberName<
  Value,
  Owner extends "Locator" | "Page",
> = Value extends `${Owner}.${infer Name}` ? Name : never;
type SelectedPageName = MemberName<CurrentSupport, "Page">;
type SelectedLocatorName = MemberName<CurrentSupport, "Locator">;

type FinderName =
  | "getByAltText"
  | "getByLabel"
  | "getByPlaceholder"
  | "getByRole"
  | "getByTestId"
  | "getByText"
  | "getByTitle";
type PageExactName =
  "ariaSnapshot" | "content" | "setDefaultTimeout" | "title" | "url";
type LocatorExactName =
  | "allInnerTexts"
  | "allTextContents"
  | "ariaSnapshot"
  | "click"
  | "count"
  | "fill"
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
  | "press"
  | "textContent"
  | "waitFor";
type LocatorSelfName = "first" | "last" | "nth";

type _PageCoverageMatchesSelection = Expect<
  Equal<SelectedPageName, FinderName | PageExactName | "locator">
>;
type _LocatorCoverageMatchesSelection = Expect<
  Equal<
    SelectedLocatorName,
    | FinderName
    | LocatorExactName
    | LocatorSelfName
    | "all"
    | "and"
    | "filter"
    | "locator"
    | "or"
  >
>;
type _BrowserPageExposesOnlySelection = Expect<
  Equal<keyof BrowserPage, SelectedPageName>
>;
type _BrowserLocatorExposesOnlySelection = Expect<
  Equal<keyof BrowserLocator, SelectedLocatorName>
>;
type _PageExactSignaturesMatch = Expect<
  Equal<
    MethodShapes<BrowserPage, PageExactName>,
    MethodShapes<Page, PageExactName>
  >
>;
type _LocatorExactSignaturesMatch = Expect<
  Equal<
    MethodShapes<BrowserLocator, LocatorExactName>,
    MethodShapes<Locator, LocatorExactName>
  >
>;

type BrowserPageFinderParameters = {
  [Name in FinderName]: Parameters<BrowserPage[Name]>;
};
type BrowserLocatorFinderParameters = {
  [Name in FinderName]: Parameters<BrowserLocator[Name]>;
};
type PlaywrightPageFinderParameters = {
  [Name in FinderName]: Parameters<Page[Name]>;
};
type PlaywrightLocatorFinderParameters = {
  [Name in FinderName]: Parameters<Locator[Name]>;
};
type BrowserPageFinderReturns = {
  [Name in FinderName]: ReturnType<BrowserPage[Name]>;
};
type BrowserLocatorFinderReturns = {
  [Name in FinderName]: ReturnType<BrowserLocator[Name]>;
};
type ExpectedFinderReturns = {
  [Name in FinderName]: BrowserLocator;
};
type _PageFinderParametersMatch = Expect<
  Equal<BrowserPageFinderParameters, PlaywrightPageFinderParameters>
>;
type _LocatorFinderParametersMatch = Expect<
  Equal<BrowserLocatorFinderParameters, PlaywrightLocatorFinderParameters>
>;
type _PageFinderReturnsBrowserLocator = Expect<
  Equal<BrowserPageFinderReturns, ExpectedFinderReturns>
>;
type _LocatorFinderReturnsBrowserLocator = Expect<
  Equal<BrowserLocatorFinderReturns, ExpectedFinderReturns>
>;

type ExpectedFilterOptions = {
  has?: BrowserLocator;
  hasNot?: BrowserLocator;
  hasText?: string | RegExp;
  hasNotText?: string | RegExp;
  visible?: boolean;
};
type _PageLocatorParametersMatch = Expect<
  Equal<
    Parameters<BrowserPage["locator"]>,
    [selector: string, options?: BrowserLocatorOptions]
  >
>;
type _LocatorLocatorParametersMatch = Expect<
  Equal<
    Parameters<BrowserLocator["locator"]>,
    [
      selectorOrLocator: string | BrowserLocator,
      options?: BrowserLocatorOptions,
    ]
  >
>;
type _LocatorOptionsMatch = Expect<
  Equal<Flatten<BrowserLocatorOptions>, Omit<ExpectedFilterOptions, "visible">>
>;
type _FilterOptionsMatch = Expect<
  Equal<Flatten<BrowserLocatorFilterOptions>, ExpectedFilterOptions>
>;
type _FilterSignatureMatches = Expect<
  Equal<
    MethodShape<BrowserLocator, "filter">,
    [arguments: [options?: BrowserLocatorFilterOptions], result: BrowserLocator]
  >
>;
type _SetOperationSignaturesMatch = Expect<
  Equal<
    Pick<BrowserLocator, "and" | "or">,
    {
      and(locator: BrowserLocator): BrowserLocator;
      or(locator: BrowserLocator): BrowserLocator;
    }
  >
>;
type _SelfLocatorParametersMatch = Expect<
  Equal<
    { [Name in LocatorSelfName]: Parameters<BrowserLocator[Name]> },
    { [Name in LocatorSelfName]: Parameters<Locator[Name]> }
  >
>;
type _SelfLocatorReturnsMatch = Expect<
  Equal<
    { [Name in LocatorSelfName]: ReturnType<BrowserLocator[Name]> },
    { [Name in LocatorSelfName]: BrowserLocator }
  >
>;
type _AllSignatureMatches = Expect<
  Equal<
    MethodShape<BrowserLocator, "all">,
    [arguments: Parameters<Locator["all"]>, result: Promise<BrowserLocator[]>]
  >
>;

describe("BrowserPage and BrowserLocator signatures", () => {
  it("cover the complete selection with pinned Playwright-compatible shapes", () => {
    void (0 as unknown as _PageCoverageMatchesSelection);
    void (0 as unknown as _LocatorCoverageMatchesSelection);
    void (0 as unknown as _BrowserPageExposesOnlySelection);
    void (0 as unknown as _BrowserLocatorExposesOnlySelection);
    void (0 as unknown as _PageExactSignaturesMatch);
    void (0 as unknown as _LocatorExactSignaturesMatch);
    void (0 as unknown as _PageFinderParametersMatch);
    void (0 as unknown as _LocatorFinderParametersMatch);
    void (0 as unknown as _PageFinderReturnsBrowserLocator);
    void (0 as unknown as _LocatorFinderReturnsBrowserLocator);
    void (0 as unknown as _PageLocatorParametersMatch);
    void (0 as unknown as _LocatorLocatorParametersMatch);
    void (0 as unknown as _LocatorOptionsMatch);
    void (0 as unknown as _FilterOptionsMatch);
    void (0 as unknown as _FilterSignatureMatches);
    void (0 as unknown as _SetOperationSignaturesMatch);
    void (0 as unknown as _SelfLocatorParametersMatch);
    void (0 as unknown as _SelfLocatorReturnsMatch);
    void (0 as unknown as _AllSignatureMatches);
    expect(true).toBe(true);
  });
});
