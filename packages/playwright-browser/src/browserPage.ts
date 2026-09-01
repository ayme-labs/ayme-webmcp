import type { Page as PlaywrightPage } from "@playwright/test";

import { InjectedScript } from "./generated/injectedScript.js";

export type BrowserRole = Parameters<PlaywrightPage["getByRole"]>[0];

export type BrowserText = Parameters<PlaywrightPage["getByText"]>[0];

export type BrowserTestId = Parameters<PlaywrightPage["getByTestId"]>[0];

export type BrowserRoleOptions = NonNullable<
  Parameters<PlaywrightPage["getByRole"]>[1]
>;

export type BrowserTextOptions = NonNullable<
  Parameters<PlaywrightPage["getByText"]>[1]
>;

export type BrowserLocatorOptions = Omit<
  NonNullable<Parameters<PlaywrightPage["locator"]>[1]>,
  "has" | "hasNot"
> & {
  has?: BrowserLocator;
  hasNot?: BrowserLocator;
};

export type BrowserLocatorFilterOptions = BrowserLocatorOptions & {
  visible?: boolean;
};

export type TraceEntry = {
  operation: "click" | "fill" | "waitFor";
  locator: string;
  state?: "visible" | "hidden";
  value?: string;
};

export interface BrowserPage {
  getByAltText(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByLabel(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByPlaceholder(
    text: BrowserText,
    options?: BrowserTextOptions
  ): BrowserLocator;
  getByRole(role: BrowserRole, options?: BrowserRoleOptions): BrowserLocator;
  getByTestId(testId: BrowserTestId): BrowserLocator;
  getByText(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByTitle(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  locator(selector: string, options?: BrowserLocatorOptions): BrowserLocator;
}

export interface BrowserLocator {
  page(): BrowserPage;
  getByAltText(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByLabel(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByPlaceholder(
    text: BrowserText,
    options?: BrowserTextOptions
  ): BrowserLocator;
  getByRole(role: BrowserRole, options?: BrowserRoleOptions): BrowserLocator;
  getByTestId(testId: BrowserTestId): BrowserLocator;
  getByText(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  getByTitle(text: BrowserText, options?: BrowserTextOptions): BrowserLocator;
  locator(
    selectorOrLocator: string | BrowserLocator,
    options?: BrowserLocatorOptions
  ): BrowserLocator;
  filter(options?: BrowserLocatorFilterOptions): BrowserLocator;
  and(locator: BrowserLocator): BrowserLocator;
  or(locator: BrowserLocator): BrowserLocator;
  first(): BrowserLocator;
  last(): BrowserLocator;
  nth(index: number): BrowserLocator;
  all(): Promise<BrowserLocator[]>;
  count(): Promise<number>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  click(): Promise<void>;
  waitFor(options: {
    state: "visible" | "hidden";
    timeout?: number;
  }): Promise<void>;
}

type BrowserPageOptions = {
  browserWindow?: Window;
  onTrace?: () => void;
  pacing?: BrowserInteractionPacing;
};

export type BrowserInteractionPacing = {
  beforeActionMs?: number;
  clickCue?: boolean;
  typingIntervalMs?: number;
};

export class BrowserLocatorImpl implements BrowserLocator {
  constructor(
    private readonly ownerPage: BrowserPageImpl,
    private readonly resolver: (scope?: Element) => Element[],
    private readonly label: string,
    private readonly trace: TraceEntry[],
    private readonly onTrace?: () => void,
    private readonly selector?: string
  ) {}

  page() {
    return this.ownerPage;
  }

  getByAltText(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByAltTextSelector(text, options),
      `${this.label}.getByAltText(${JSON.stringify(text)})`
    );
  }

  getByLabel(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByLabelSelector(text, options),
      `${this.label}.getByLabel(${JSON.stringify(text)})`
    );
  }

  getByPlaceholder(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByPlaceholderSelector(text, options),
      `${this.label}.getByPlaceholder(${JSON.stringify(text)})`
    );
  }

  getByRole(role: BrowserRole, options: BrowserRoleOptions = {}) {
    return this.createFinder(
      getByRoleSelector(role, options),
      `${this.label}.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`
    );
  }

  getByTestId(testId: BrowserTestId) {
    return this.createFinder(
      getByTestIdSelector(testId),
      `${this.label}.getByTestId(${JSON.stringify(testId)})`
    );
  }

  getByText(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByTextSelector(text, options),
      `${this.label}.getByText(${JSON.stringify(text)})`
    );
  }

  getByTitle(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByTitleSelector(text, options),
      `${this.label}.getByTitle(${JSON.stringify(text)})`
    );
  }

  locator(
    selectorOrLocator: string | BrowserLocator,
    options: BrowserLocatorOptions = {}
  ): BrowserLocator {
    const selector =
      typeof selectorOrLocator === "string"
        ? selectorOrLocator
        : resolveLocatorSelector(selectorOrLocator);
    const composedSelector = appendLocatorOptions(selector, options);
    return this.createFinder(
      composedSelector,
      `${this.label}.locator(${JSON.stringify(selector)})`
    );
  }

  filter(options: BrowserLocatorFilterOptions = {}) {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) =>
        this.resolveElements(scope).filter((element) => {
          if (
            options.hasText !== undefined &&
            !matchesText(element, options.hasText)
          )
            return false;
          if (
            options.hasNotText !== undefined &&
            matchesText(element, options.hasNotText)
          )
            return false;
          if (
            options.has !== undefined &&
            !resolveLocatorElements(options.has, element, this.ownerPage).length
          ) {
            return false;
          }
          if (
            options.hasNot !== undefined &&
            resolveLocatorElements(options.hasNot, element, this.ownerPage)
              .length
          ) {
            return false;
          }
          if (
            options.visible !== undefined &&
            isVisible(element) !== options.visible
          )
            return false;
          return true;
        }),
      `${this.label}.filter(...)`,
      this.trace,
      this.onTrace
    );
  }

  and(locator: BrowserLocator) {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) => {
        const other = new Set(
          resolveLocatorElements(locator, scope, this.ownerPage)
        );
        return this.resolveElements(scope).filter((element) =>
          other.has(element)
        );
      },
      `${this.label}.and(...)`,
      this.trace,
      this.onTrace
    );
  }

  or(locator: BrowserLocator): BrowserLocator {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) =>
        sortInDocumentOrder([
          ...this.resolveElements(scope),
          ...resolveLocatorElements(locator, scope, this.ownerPage),
        ]),
      `${this.label}.or(...)`,
      this.trace,
      this.onTrace
    );
  }

  first() {
    return this.nth(0);
  }

  last() {
    return this.nth(-1);
  }

  getSelector() {
    return this.selector;
  }

  private createFinder(selector: string, label: string) {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) =>
        this.ownerPage.querySelectorAll(selector, this.resolveElements(scope)),
      label,
      this.trace,
      this.onTrace,
      selector
    );
  }

  nth(index: number) {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) => {
        const elements = this.resolveElements(scope);
        const element = elements[index < 0 ? elements.length + index : index];
        return element ? [element] : [];
      },
      `${this.label}.nth(${index})`,
      this.trace,
      this.onTrace
    );
  }

  async all() {
    const count = this.resolveElements().length;
    return Array.from({ length: count }, (_, index) => this.nth(index));
  }

  async count() {
    return this.resolveElements().length;
  }

  async fill(value: string) {
    this.record({ operation: "fill", locator: this.label, value });
    await this.ownerPage.waitBeforeAction();
    const element = this.requireSingleElement();
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.focus();
      await this.fillInputElement(element, value);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      await this.fillContentEditableElement(element, value);
      return;
    }
    throw new Error(
      `fill() is only supported for input, textarea, or contenteditable elements (${this.label})`
    );
  }

  async click() {
    this.record({ operation: "click", locator: this.label });
    await this.ownerPage.waitBeforeClick(this.requireSingleElement());
    const element = this.requireSingleElement();
    if (element instanceof HTMLElement) {
      element.click();
      return;
    }
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }

  async press(key: string) {
    await this.ownerPage.waitBeforeAction();
    const element = this.requireSingleElement();
    dispatchKeyboardEvent(element, "keydown", key);
    dispatchKeyboardEvent(element, "keypress", key);
    dispatchKeyboardEvent(element, "keyup", key);

    if (key === "Enter" && element instanceof HTMLInputElement)
      element.form?.requestSubmit();
  }

  async waitFor(options: { state: "visible" | "hidden"; timeout?: number }) {
    const timeout = options.timeout ?? 1_000;
    this.record({
      operation: "waitFor",
      locator: this.label,
      state: options.state,
    });

    if (this.isInState(options.state)) return;

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + timeout;
      let timeoutHandle: number | undefined;
      const observer = new MutationObserver(() => check());

      const finish = (error?: Error) => {
        observer.disconnect();
        if (timeoutHandle !== undefined)
          this.ownerPage.window.clearTimeout(timeoutHandle);
        if (error) reject(error);
        else resolve();
      };

      const check = () => {
        if (this.isInState(options.state)) {
          finish();
          return;
        }
        if (Date.now() >= deadline) {
          finish(
            new Error(
              `Timed out waiting for ${this.label} to become ${options.state}.`
            )
          );
          return;
        }
        timeoutHandle = this.ownerPage.window.setTimeout(check, 10);
      };

      observer.observe(this.ownerPage.document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      timeoutHandle = this.ownerPage.window.setTimeout(check, 0);
    });
  }

  resolveElements(scope?: Element) {
    return this.resolver(scope).filter(isElement);
  }

  private isInState(state: "visible" | "hidden") {
    const elements = this.resolveElements();
    return state === "visible"
      ? elements.some(isVisible)
      : elements.every((element) => !isVisible(element));
  }

  private requireSingleElement() {
    const elements = this.resolveElements();
    const first = elements[0];
    if (!first) throw new Error(`No elements found for locator ${this.label}`);
    if (elements.length > 1)
      throw new Error(
        `Expected one element for locator ${this.label}, found ${elements.length}`
      );
    return first;
  }

  private record(entry: TraceEntry) {
    this.trace.push(entry);
    this.onTrace?.();
  }

  private async fillInputElement(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    if (!this.ownerPage.shouldTypeCharacterByCharacter()) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.value += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.ownerPage.waitBetweenTypedCharacters();
    }
  }

  private async fillContentEditableElement(
    element: HTMLElement,
    value: string
  ) {
    if (!this.ownerPage.shouldTypeCharacterByCharacter()) {
      element.textContent = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.textContent = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.textContent += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.ownerPage.waitBetweenTypedCharacters();
    }
  }
}

export class BrowserPageImpl implements BrowserPage {
  readonly document: Document;
  readonly window: Window;
  private readonly injectedScript: InjectedScript;

  constructor(
    browserWindow: Window,
    private readonly trace: TraceEntry[] = [],
    private readonly onTrace?: () => void,
    private readonly pacing: BrowserInteractionPacing = {}
  ) {
    this.window = browserWindow;
    this.document = browserWindow.document;
    this.injectedScript = new InjectedScript(
      browserWindow as Window & typeof globalThis,
      {
        browserName: "chromium",
        customEngines: [],
        frameSeq: 0,
        isUnderTest: false,
        sdkLanguage: "javascript",
        stableRafCount: 0,
        testIdAttributeName: "data-testid",
      }
    );
  }

  static fromWindow(
    browserWindow: Window = window,
    trace: TraceEntry[] = [],
    onTrace?: () => void,
    pacing?: BrowserInteractionPacing
  ) {
    return new BrowserPageImpl(browserWindow, trace, onTrace, pacing);
  }

  async waitBeforeAction() {
    await this.wait(this.pacing.beforeActionMs);
  }

  async waitBeforeClick(element: Element) {
    const duration = this.pacing.beforeActionMs ?? 0;
    const cueDuration = this.pacing.clickCue ? Math.min(duration, 160) : 0;

    await this.wait(duration - cueDuration);
    if (!cueDuration) return;

    const cue = this.createClickCue(element, cueDuration);
    try {
      await this.wait(cueDuration);
    } finally {
      cue?.remove();
    }
  }

  shouldTypeCharacterByCharacter() {
    return (this.pacing.typingIntervalMs ?? 0) > 0;
  }

  async waitBetweenTypedCharacters() {
    await this.wait(this.pacing.typingIntervalMs);
  }

  getByAltText(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByAltTextSelector(text, options),
      `page.getByAltText(${JSON.stringify(text)})`
    );
  }

  getByLabel(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByLabelSelector(text, options),
      `page.getByLabel(${JSON.stringify(text)})`
    );
  }

  getByPlaceholder(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByPlaceholderSelector(text, options),
      `page.getByPlaceholder(${JSON.stringify(text)})`
    );
  }

  getByRole(role: BrowserRole, options: BrowserRoleOptions = {}) {
    return this.createFinder(
      getByRoleSelector(role, options),
      `page.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`
    );
  }

  getByTestId(testId: BrowserTestId) {
    return this.createFinder(
      getByTestIdSelector(testId),
      `page.getByTestId(${JSON.stringify(testId)})`
    );
  }

  getByText(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByTextSelector(text, options),
      `page.getByText(${JSON.stringify(text)})`
    );
  }

  getByTitle(text: BrowserText, options?: BrowserTextOptions) {
    return this.createFinder(
      getByTitleSelector(text, options),
      `page.getByTitle(${JSON.stringify(text)})`
    );
  }

  locator(selector: string, options: BrowserLocatorOptions = {}) {
    const composedSelector = appendLocatorOptions(selector, options);
    return this.createLocator(
      (scope) =>
        this.querySelectorAll(composedSelector, [scope ?? this.document]),
      `page.locator(${JSON.stringify(selector)})`,
      composedSelector
    );
  }

  querySelectorAll(selector: string, roots: readonly (Document | Element)[]) {
    const parsedSelector = this.injectedScript.parseSelector(selector);
    const elements = new Set<Element>();
    for (const root of roots) {
      for (const element of this.injectedScript.querySelectorAll(
        parsedSelector,
        root
      ))
        elements.add(element);
    }
    return [...elements];
  }

  private createFinder(selector: string, label: string) {
    return this.createLocator(
      (scope) => this.querySelectorAll(selector, [scope ?? this.document]),
      label,
      selector
    );
  }

  private createLocator(
    resolver: (scope?: Element) => Element[],
    label: string,
    selector?: string
  ) {
    return new BrowserLocatorImpl(
      this,
      resolver,
      label,
      this.trace,
      this.onTrace,
      selector
    );
  }

  private async wait(durationMs: number | undefined) {
    if (!durationMs || durationMs <= 0) return;
    await new Promise<void>((resolve) =>
      this.window.setTimeout(resolve, durationMs)
    );
  }

  private createClickCue(element: Element, duration: number) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return undefined;

    const cue = this.document.createElement("div");
    cue.setAttribute("aria-hidden", "true");
    cue.style.background = "rgb(77 126 219 / 18%)";
    cue.style.border = "2px solid rgb(77 126 219 / 80%)";
    cue.style.borderRadius = "999px";
    cue.style.height = "2rem";
    cue.style.left = `${bounds.left + bounds.width / 2}px`;
    cue.style.pointerEvents = "none";
    cue.style.position = "fixed";
    cue.style.top = `${bounds.top + bounds.height / 2}px`;
    cue.style.transform = "translate(-50%, -50%)";
    cue.style.width = "2rem";
    cue.style.zIndex = "2147483647";
    this.document.body.append(cue);

    const reducedMotion = this.window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    cue.animate(
      reducedMotion
        ? [{ opacity: 0.9 }, { opacity: 0 }]
        : [
            { opacity: 0.9, transform: "translate(-50%, -50%) scale(0.95)" },
            { opacity: 0, transform: "translate(-50%, -50%) scale(1.35)" },
          ],
      {
        duration,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "forwards",
      }
    );
    return cue;
  }
}

export function createBrowserPage(options: BrowserPageOptions = {}) {
  const trace: TraceEntry[] = [];
  const page = BrowserPageImpl.fromWindow(
    options.browserWindow ?? window,
    trace,
    options.onTrace,
    options.pacing
  );

  return {
    page,
    trace,
    resetTrace() {
      trace.splice(0);
      options.onTrace?.();
    },
  };
}

function isVisible(element: Element) {
  if (!element.isConnected || element.getAttribute("aria-hidden") === "true")
    return false;
  if (element instanceof HTMLElement && element.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function matchesText(element: Element, pattern: string | RegExp) {
  const text = element.textContent ?? "";
  if (typeof pattern === "string")
    return normalizeText(text)
      .toLowerCase()
      .includes(normalizeText(pattern).toLowerCase());

  const lastIndex = pattern.lastIndex;
  pattern.lastIndex = 0;
  const matches = pattern.test(text);
  pattern.lastIndex = lastIndex;
  return matches;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dispatchKeyboardEvent(
  target: Element,
  type: "keydown" | "keypress" | "keyup",
  key: string
) {
  target.dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
  );
}

function resolveLocatorElements(
  locator: BrowserLocator,
  scope?: Element,
  ownerPage?: BrowserPageImpl
): Element[] {
  if (locator instanceof BrowserLocatorImpl) {
    if (ownerPage !== undefined && locator.page() !== ownerPage)
      throw new Error("Locators must belong to the same BrowserPage.");
    return locator.resolveElements(scope);
  }
  throw new Error(
    "Unsupported locator implementation. Use the Ayme browser runtime."
  );
}

function resolveLocatorSelector(locator: BrowserLocator): string {
  if (locator instanceof BrowserLocatorImpl) {
    const selector: string | undefined = locator.getSelector();
    if (selector !== undefined) return selector;
  }
  throw new Error(
    "Unsupported locator implementation. Use the Ayme browser runtime."
  );
}

function appendLocatorOptions(
  selector: string,
  options: BrowserLocatorOptions
) {
  if (options.hasText)
    selector += ` >> internal:has-text=${escapeForTextSelector(options.hasText, false)}`;
  if (options.hasNotText)
    selector += ` >> internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`;
  if (options.has)
    selector += ` >> internal:has=${JSON.stringify(resolveLocatorSelector(options.has))}`;
  if (options.hasNot)
    selector += ` >> internal:has-not=${JSON.stringify(resolveLocatorSelector(options.hasNot))}`;
  return selector;
}

function getByTestIdSelector(testId: string | RegExp) {
  return `internal:testid=[data-testid=${escapeForAttributeSelector(testId, true)}]`;
}

function getByLabelSelector(
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return `internal:label=${escapeForTextSelector(text, !!options?.exact)}`;
}

function getByAltTextSelector(
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return getByAttributeTextSelector("alt", text, options);
}

function getByTitleSelector(
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return getByAttributeTextSelector("title", text, options);
}

function getByPlaceholderSelector(
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return getByAttributeTextSelector("placeholder", text, options);
}

function getByTextSelector(
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return `internal:text=${escapeForTextSelector(text, !!options?.exact)}`;
}

function getByRoleSelector(
  role: BrowserRole,
  options: BrowserRoleOptions = {}
) {
  const props: string[][] = [];
  for (const [name, value] of [
    ["checked", options.checked],
    ["disabled", options.disabled],
    ["selected", options.selected],
    ["expanded", options.expanded],
    ["include-hidden", options.includeHidden],
    ["level", options.level],
    ["name", options.name],
    ["description", options.description],
    ["pressed", options.pressed],
  ] as const) {
    if (value === undefined) continue;
    props.push([
      name,
      typeof value === "string" || value instanceof RegExp
        ? escapeForAttributeSelector(value, !!options.exact)
        : String(value),
    ]);
  }
  return `internal:role=${role}${props
    .map(([name, value]) => `[${name}=${value}]`)
    .join("")}`;
}

function getByAttributeTextSelector(
  attribute: string,
  text: string | RegExp,
  options?: BrowserTextOptions
) {
  return `internal:attr=[${attribute}=${escapeForAttributeSelector(
    text,
    !!options?.exact
  )}]`;
}

function escapeForTextSelector(text: string | RegExp, exact: boolean) {
  if (typeof text !== "string") return escapeRegexForSelector(text);
  return `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}

function escapeForAttributeSelector(value: string | RegExp, exact: boolean) {
  if (typeof value !== "string") return escapeRegexForSelector(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${
    exact ? "s" : "i"
  }`;
}

function escapeRegexForSelector(regex: RegExp) {
  if (
    regex.unicode ||
    (regex as RegExp & { unicodeSets?: boolean }).unicodeSets
  )
    return String(regex);
  return String(regex)
    .replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\$3")
    .replace(/>>/g, "\\>\\>");
}

function sortInDocumentOrder(elements: Iterable<Element>) {
  return [...new Set(elements)].sort((left, right) => {
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function isElement(value: unknown): value is Element {
  return value instanceof Element;
}
