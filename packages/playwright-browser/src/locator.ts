import type {
  AriaSnapshotOptions,
  LocatorQueryOptions,
  PageImpl,
  SelectOptionValue,
} from "./page";
import {
  escapeForTextSelector,
  getByAltTextSelector,
  getByLabelSelector,
  getByPlaceholderSelector,
  getByRoleSelector,
  getByTestIdSelector,
  getByTextSelector,
  getByTitleSelector,
} from "./selectors";
import type { TraceEntry } from "./types";

/**
 * Cross-realm brand symbol. Any code can test for this with
 * `Symbol.for(...)` without importing LocatorImpl.
 */
export const LOCATOR_BRAND = Symbol.for("ayme:locator");

/** Structured payload carried by the brand symbol. */
export type LocatorBrandPayload = {
  readonly ownerPage: PageImpl;
  readonly getSelector: () => string;
  readonly resolveElements: () => Element[];
};

export type ByRoleOptions = {
  name?: string | RegExp;
  exact?: boolean;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  includeHidden?: boolean;
  level?: number;
  pressed?: boolean;
  selected?: boolean;
  description?: string | RegExp;
};

export type LocatorOptions = {
  hasText?: string | RegExp;
  hasNotText?: string | RegExp;
  has?: LocatorImpl;
  hasNot?: LocatorImpl;
  visible?: boolean;
};

export class LocatorImpl {
  /**
   * Brand property carrying the structured payload.
   * Validated through {@link requireBrand} — no private-field casts needed.
   *
   * Pinned source ref: enekesabel/playwright@b25d782, Locator class uses
   * `_frame` and `_selector` directly; we expose equivalent access through
   * the brand payload instead.
   */
  readonly [LOCATOR_BRAND]!: LocatorBrandPayload;

  constructor(
    private readonly ownerPage: PageImpl,
    private selector: string,
    private readonly label: string,
    private readonly onTrace?: (entry: TraceEntry) => void,
    options?: LocatorOptions,
    private readonly customDescription?: string
  ) {
    // Mirrors pinned b25d782 Locator constructor option processing
    if (options?.hasText)
      this.selector += ` >> internal:has-text=${escapeForTextSelector(options.hasText, false)}`;
    if (options?.hasNotText)
      this.selector += ` >> internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`;
    if (options?.has) {
      const brand = requireBrand(options.has, `Inner "has"`);
      if (brand.ownerPage !== this.ownerPage)
        throw new Error(`Inner "has" locator must belong to the same frame.`);
      this.selector +=
        ` >> internal:has=` + JSON.stringify(brand.getSelector());
    }
    if (options?.hasNot) {
      const brand = requireBrand(options.hasNot, `Inner "hasNot"`);
      if (brand.ownerPage !== this.ownerPage)
        throw new Error(
          `Inner "hasNot" locator must belong to the same frame.`
        );
      this.selector +=
        ` >> internal:has-not=` + JSON.stringify(brand.getSelector());
    }
    if (options?.visible !== undefined)
      this.selector += ` >> visible=${options.visible ? "true" : "false"}`;

    // Assign the frozen brand payload once, after all selector mutations.
    // Closures capture `this` so getSelector/resolveElements always reflect
    // the final selector value.
    this[LOCATOR_BRAND] = Object.freeze({
      ownerPage: this.ownerPage,
      getSelector: () => this.selector,
      resolveElements: () => this.ownerPage.resolveAll(this.selector),
    } satisfies LocatorBrandPayload);
  }

  // ── Selector composition ──────────────────────────────────────

  page() {
    return this.ownerPage;
  }

  describe(description: string) {
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> internal:describe=${JSON.stringify(description)}`,
      this.label,
      this.onTrace,
      undefined,
      description
    );
  }

  description(): string | null {
    return this.customDescription ?? null;
  }

  toString(): string {
    if (this.customDescription) return this.customDescription;
    return this.label
      .replace(/^page\./, "")
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, "'$1'");
  }

  getByRole(role: string, options: ByRoleOptions = {}) {
    const roleSelector = getByRoleSelector(role, options);
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> ${roleSelector}`,
      `${this.label}.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`,
      this.onTrace
    );
  }

  getByText(text: string | RegExp, options: { exact?: boolean } = {}) {
    return this.locator(getByTextSelector(text, options.exact));
  }
  getByLabel(text: string | RegExp, options: { exact?: boolean } = {}) {
    return this.locator(getByLabelSelector(text, options.exact));
  }
  getByTestId(testId: string | RegExp) {
    return this.locator(getByTestIdSelector(testId));
  }
  getByPlaceholder(text: string | RegExp, options: { exact?: boolean } = {}) {
    return this.locator(getByPlaceholderSelector(text, options.exact));
  }
  getByAltText(text: string | RegExp, options: { exact?: boolean } = {}) {
    return this.locator(getByAltTextSelector(text, options.exact));
  }
  getByTitle(text: string | RegExp, options: { exact?: boolean } = {}) {
    return this.locator(getByTitleSelector(text, options.exact));
  }

  /**
   * Mirrors pinned b25d782 Locator.locator:
   * - string → `this._selector + ' >> ' + selector`
   * - Locator → `this._selector + ' >> internal:chain=' + JSON.stringify(locator._selector)`
   */
  locator(
    selectorOrLocator: string | LocatorImpl,
    options?: Omit<LocatorOptions, "visible">
  ) {
    if (typeof selectorOrLocator === "string") {
      return new LocatorImpl(
        this.ownerPage,
        `${this.selector} >> ${selectorOrLocator}`,
        `${this.label}.locator(${JSON.stringify(selectorOrLocator)})`,
        this.onTrace,
        options
      );
    }
    const brand = requireBrand(selectorOrLocator, "selectorOrLocator");
    if (brand.ownerPage !== this.ownerPage)
      throw new Error(`Locators must belong to the same frame.`);
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> internal:chain=` +
        JSON.stringify(brand.getSelector()),
      `${this.label}.locator(locator)`,
      this.onTrace,
      options
    );
  }

  filter(options?: LocatorOptions) {
    return new LocatorImpl(
      this.ownerPage,
      this.selector,
      `${this.label}.filter(...)`,
      this.onTrace,
      options
    );
  }

  /** Mirrors pinned b25d782 Locator.and selector serialization. */
  and(locator: LocatorImpl) {
    const brand = requireBrand(locator, "locator");
    if (brand.ownerPage !== this.ownerPage)
      throw new Error(`Locators must belong to the same frame.`);
    return new LocatorImpl(
      this.ownerPage,
      this.selector + ` >> internal:and=` + JSON.stringify(brand.getSelector()),
      `${this.label}.and(locator)`,
      this.onTrace
    );
  }

  /** Mirrors pinned b25d782 Locator.or selector serialization. */
  or(locator: LocatorImpl) {
    const brand = requireBrand(locator, "locator");
    if (brand.ownerPage !== this.ownerPage)
      throw new Error(`Locators must belong to the same frame.`);
    return new LocatorImpl(
      this.ownerPage,
      this.selector + ` >> internal:or=` + JSON.stringify(brand.getSelector()),
      `${this.label}.or(locator)`,
      this.onTrace
    );
  }

  nth(index: number) {
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> nth=${index}`,
      `${this.label}.nth(${index})`,
      this.onTrace
    );
  }

  first() {
    return this.nth(0);
  }

  last() {
    return this.nth(-1);
  }

  // ── Collection ────────────────────────────────────────────────

  async all() {
    const count = this.ownerPage.resolveAll(this.selector).length;
    return Array.from({ length: count }, (_, i) => this.nth(i));
  }

  async count() {
    return this.ownerPage.resolveAll(this.selector).length;
  }

  // ── Query and state operations ─────────────────────────────────

  async getAttribute(
    name: string,
    options?: LocatorQueryOptions
  ): Promise<string | null> {
    return this.ownerPage.locatorGetAttribute(
      this.selector,
      this.label,
      name,
      options
    );
  }

  async textContent(options?: LocatorQueryOptions): Promise<string | null> {
    return this.ownerPage.locatorTextContent(
      this.selector,
      this.label,
      options
    );
  }

  async innerText(options?: LocatorQueryOptions): Promise<string> {
    return this.ownerPage.locatorInnerText(this.selector, this.label, options);
  }

  async innerHTML(options?: LocatorQueryOptions): Promise<string> {
    return this.ownerPage.locatorInnerHTML(this.selector, this.label, options);
  }

  async allInnerTexts(): Promise<string[]> {
    return this.ownerPage.locatorAllInnerTexts(this.selector);
  }

  async allTextContents(): Promise<string[]> {
    return this.ownerPage.locatorAllTextContents(this.selector);
  }

  async inputValue(options?: LocatorQueryOptions): Promise<string> {
    return this.ownerPage.locatorInputValue(this.selector, this.label, options);
  }

  async isEnabled(options?: LocatorQueryOptions): Promise<boolean> {
    return this.ownerPage.locatorIsEnabled(this.selector, this.label, options);
  }

  async isDisabled(options?: LocatorQueryOptions): Promise<boolean> {
    return this.ownerPage.locatorIsDisabled(this.selector, this.label, options);
  }

  async isChecked(options?: LocatorQueryOptions): Promise<boolean> {
    return this.ownerPage.locatorIsChecked(this.selector, this.label, options);
  }

  async isEditable(options?: LocatorQueryOptions): Promise<boolean> {
    return this.ownerPage.locatorIsEditable(this.selector, this.label, options);
  }

  async isVisible(options?: LocatorQueryOptions): Promise<boolean> {
    return this.ownerPage.locatorIsVisible(this.selector, this.label, options);
  }

  async isHidden(options?: LocatorQueryOptions): Promise<boolean> {
    return !this.ownerPage.locatorIsVisible(this.selector, this.label, options);
  }

  async boundingBox(options?: LocatorQueryOptions) {
    return this.ownerPage.locatorBoundingBox(
      this.selector,
      this.label,
      options
    );
  }

  /**
   * Captures the accessibility snapshot rooted at this locator's sole element.
   *
   * The compiled InjectedScript remains the only ARIA implementation. This
   * method intentionally resolves within the one controlled document and does
   * not add frame traversal or browser-process behavior.
   */
  async ariaSnapshot(options: AriaSnapshotOptions = {}): Promise<string> {
    return this.ownerPage.locatorAriaSnapshot(
      this.selector,
      this.label,
      options
    );
  }

  // ── Expectations and callback operations ────────────────────────

  /**
   * The public Playwright matcher implementation calls this private-shaped
   * protocol method. Keep it here, rather than teaching the bridge about
   * individual matchers, so the pinned InjectedScript remains the semantic
   * authority for text, count, and element-state expectations.
   */
  async _expect(expression: string, options: Record<string, unknown>) {
    this.record({ operation: "expect" });
    return this.ownerPage.expect(this.selector, expression, options);
  }

  async evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageFunction: (element: Element, arg?: unknown) => any,
    arg?: unknown,
    options?: LocatorQueryOptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.ownerPage.locatorEvaluate(
      this.selector,
      this.label,
      pageFunction,
      arg,
      options
    );
  }

  async evaluateAll(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageFunction: (elements: Element[], arg?: unknown) => any,
    arg?: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return await pageFunction(this.ownerPage.resolveAll(this.selector), arg);
  }

  // ── Terminal operations (delegated to Page) ───────────────────

  async click(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("click", options);
    this.record({ operation: "click" });
    await this.ownerPage.click(this.selector, this.label);
  }

  async fill(value: string, options?: Record<string, unknown>) {
    rejectUnsupportedOptions("fill", options);
    this.record({ operation: "fill", value });
    await this.ownerPage.fill(this.selector, value, this.label);
  }

  async press(key: string, options?: Record<string, unknown>) {
    rejectUnsupportedOptions("press", options);
    await this.ownerPage.press(this.selector, key, this.label);
  }

  async focus(options?: LocatorQueryOptions) {
    await this.ownerPage.focus(this.selector, this.label, options);
  }

  async blur(options?: LocatorQueryOptions) {
    await this.ownerPage.blur(this.selector, this.label, options);
  }

  async clear(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("clear", options);
    await this.ownerPage.fill(this.selector, "", this.label);
  }

  async hover(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("hover", options);
    await this.ownerPage.hover(this.selector, this.label);
  }

  async check(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("check", options);
    await this.ownerPage.setChecked(this.selector, true, this.label);
  }

  async uncheck(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("uncheck", options);
    await this.ownerPage.setChecked(this.selector, false, this.label);
  }

  async setChecked(checked: boolean, options?: Record<string, unknown>) {
    rejectUnsupportedOptions("setChecked", options);
    await this.ownerPage.setChecked(this.selector, checked, this.label);
  }

  async selectOption(
    values: string | SelectOptionValue | (string | SelectOptionValue)[] | null,
    options?: Record<string, unknown>
  ) {
    rejectUnsupportedOptions("selectOption", options);
    return this.ownerPage.selectOption(this.selector, values, this.label);
  }

  async selectText(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("selectText", options);
    await this.ownerPage.selectText(this.selector, this.label);
  }

  async scrollIntoViewIfNeeded(options?: Record<string, unknown>) {
    rejectUnsupportedOptions("scrollIntoViewIfNeeded", options);
    await this.ownerPage.scrollLocatorIntoView(this.selector, this.label);
  }

  async pressSequentially(
    text: string,
    options: { delay?: number } = {}
  ): Promise<void> {
    rejectUnsupportedOptions("pressSequentially", options, ["delay"]);
    for (const character of text) {
      await this.ownerPage.press(this.selector, character, this.label);
      if (options.delay && options.delay > 0)
        await new Promise<void>((resolve) =>
          this.ownerPage.window.setTimeout(resolve, options.delay)
        );
    }
  }

  async waitFor(
    options: {
      state?: "attached" | "detached" | "visible" | "hidden";
      timeout?: number;
    } = {}
  ) {
    const state = options.state ?? "visible";
    if (state === "attached" || state === "detached") {
      throw new Error(
        `waitFor(): state "${state}" is not supported by the single-document adapter. ` +
          `Use "visible" or "hidden".`
      );
    }
    rejectUnsupportedOptions("waitFor", options, ["state", "timeout"]);
    this.record({ operation: "waitFor", state });
    await this.ownerPage.waitForState(
      this.selector,
      { state, timeout: options.timeout },
      this.label
    );
  }

  // ── Tracing ───────────────────────────────────────────────────

  private record(entry: Omit<TraceEntry, "locator">) {
    this.onTrace?.({ ...entry, locator: this.label });
  }
}

// ── Brand validation ────────────────────────────────────────────────

/**
 * Single validation helper for the structured brand payload.
 * Every public resolver function delegates to this; no private-field casts
 * exist outside this function.
 */
function requireBrand(value: unknown, context: string): LocatorBrandPayload {
  if (typeof value !== "object" || value === null || !(LOCATOR_BRAND in value))
    throw new TypeError(
      `${context}: expected an Ayme Locator, ` +
        `got ${value === null ? "null" : typeof value}`
    );
  const payload = (value as Record<symbol, unknown>)[LOCATOR_BRAND];
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).getSelector !== "function" ||
    typeof (payload as Record<string, unknown>).resolveElements !== "function"
  )
    throw new TypeError(
      `${context}: expected an Ayme Locator, got incompatible branded object`
    );
  return payload as LocatorBrandPayload;
}

// ── Public resolver API ─────────────────────────────────────────────

/**
 * Returns `true` if `value` carries a valid structured locator brand.
 * Does NOT use `instanceof`; works cross-realm.
 */
export function isAymeLocator(value: unknown): boolean {
  try {
    requireBrand(value, "isAymeLocator");
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the selector string from a branded locator.
 * Throws diagnostically for non-locator values and cross-page locators.
 */
export function extractSelector(
  locator: unknown,
  callerPage: PageImpl,
  paramName: string
): string {
  const brand = requireBrand(locator, paramName);
  if (brand.ownerPage !== callerPage)
    throw new Error(
      `${paramName}: locator belongs to a different Page; ` +
        `cross-page filter locators are not supported`
    );
  return brand.getSelector();
}

/**
 * Resolves the matching DOM elements for a branded locator.
 * Throws for non-locator values.
 */
export function resolveLocatorElements(value: unknown): Element[] {
  return requireBrand(value, "resolveLocatorElements").resolveElements();
}

// ── Helpers ─────────────────────────────────────────────────────────

function rejectUnsupportedOptions(
  method: string,
  options: Record<string, unknown> | undefined,
  supported: string[] = []
): void {
  if (!options) return;
  const unsupported = Object.keys(options).filter(
    (key) => !supported.includes(key)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `${method}(): unsupported Playwright option(s): ${unsupported.join(", ")}.`
    );
  }
}
