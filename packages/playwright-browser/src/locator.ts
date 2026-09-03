import type { PageImpl } from "./page";
import { escapeForTextSelector, getByRoleSelector } from "./selectors";
import type { TraceEntry } from "./types";

export class LocatorImpl {
  constructor(
    private readonly ownerPage: PageImpl,
    private readonly selector: string,
    private readonly label: string,
    private readonly onTrace?: (entry: TraceEntry) => void
  ) {}

  // ── Selector composition ──────────────────────────────────────

  page() {
    return this.ownerPage;
  }

  getByRole(role: string, options: { name?: string; exact?: boolean } = {}) {
    const roleSelector = getByRoleSelector(role, options);
    const optString =
      options.name !== undefined ? `, ${JSON.stringify(options)}` : "";
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> ${roleSelector}`,
      `${this.label}.getByRole(${JSON.stringify(role)}${optString})`,
      this.onTrace
    );
  }

  locator(selector: string) {
    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> ${selector}`,
      `${this.label}.locator(${JSON.stringify(selector)})`,
      this.onTrace
    );
  }

  filter(options: {
    hasText?: string | RegExp;
    hasNotText?: string | RegExp;
    has?: LocatorImpl;
    hasNot?: LocatorImpl;
  }) {
    const tokens: string[] = [];
    if (options.hasText !== undefined)
      tokens.push(
        `internal:has-text=${escapeForTextSelector(options.hasText, false)}`
      );
    if (options.hasNotText !== undefined)
      tokens.push(
        `internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`
      );
    if (options.has !== undefined)
      tokens.push(`internal:has=${options.has.selector}`);
    if (options.hasNot !== undefined)
      tokens.push(`internal:has-not=${options.hasNot.selector}`);

    return new LocatorImpl(
      this.ownerPage,
      `${this.selector} >> ${tokens.join(" >> ")}`,
      `${this.label}.filter(...)`,
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

  // ── Collection ────────────────────────────────────────────────

  async all() {
    const elements = this.ownerPage.resolveAll(this.selector);
    return elements.map(
      (_, index) =>
        new LocatorImpl(
          this.ownerPage,
          `${this.selector} >> nth=${index}`,
          `${this.label}.all()[${index}]`,
          this.onTrace
        )
    );
  }

  async count() {
    return this.ownerPage.resolveAll(this.selector).length;
  }

  resolveElements() {
    return this.ownerPage.resolveAll(this.selector);
  }

  // ── Terminal operations (delegated to Page) ───────────────────

  async click() {
    this.record({ operation: "click" });
    await this.ownerPage.click(this.selector, this.label);
  }

  async fill(value: string) {
    this.record({ operation: "fill", value });
    await this.ownerPage.fill(this.selector, value, this.label);
  }

  async press(key: string) {
    await this.ownerPage.press(this.selector, key, this.label);
  }

  async waitFor(options: { state: "visible" | "hidden"; timeout?: number }) {
    this.record({ operation: "waitFor", state: options.state });
    await this.ownerPage.waitForState(this.selector, options, this.label);
  }

  // ── Tracing ───────────────────────────────────────────────────

  private record(entry: Omit<TraceEntry, "locator">) {
    this.onTrace?.({ ...entry, locator: this.label });
  }
}
