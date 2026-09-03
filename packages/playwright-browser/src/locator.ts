import type { PageImpl } from "./page";
import { escapeForTextSelector, getByRoleSelector } from "./selectors";
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
    options?: LocatorOptions
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

  getByRole(role: string, options: ByRoleOptions = {}) {
    const roleSelector = getByRoleSelector(role, options);
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> ${roleSelector}`,
      `${this.label}.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`,
      this.onTrace
    );
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
      `${method}(): unsupported options: ${unsupported.join(", ")}. ` +
        `The single-document adapter does not support these Playwright options.`
    );
  }
}
