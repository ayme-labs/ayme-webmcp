import type {
  Locator as PlaywrightLocator,
  Page as PlaywrightPage,
} from "@playwright/test";

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

export type BrowserLocatorReadOptions = {
  signal?: AbortSignal;
  timeout?: number;
};

export type BrowserLocatorVisibilityOptions = {
  timeout?: number;
};

export type BrowserAriaSnapshotOptions = NonNullable<
  Parameters<PlaywrightPage["ariaSnapshot"]>[0]
>;

export type BrowserLocatorWaitForOptions = NonNullable<
  Parameters<PlaywrightLocator["waitFor"]>[0]
>;

export type TraceEntry = {
  operation: "click" | "fill" | "press" | "waitFor";
  locator: string;
  key?: string;
  state?: "attached" | "detached" | "visible" | "hidden";
  value?: string;
};

export type BrowserLocatorClickOptions = Parameters<
  PlaywrightLocator["click"]
>[0];
export type BrowserLocatorFillOptions = Parameters<
  PlaywrightLocator["fill"]
>[1];
export type BrowserLocatorPressOptions = Parameters<
  PlaywrightLocator["press"]
>[1];

export interface BrowserPage {
  ariaSnapshot(options?: BrowserAriaSnapshotOptions): Promise<string>;
  content(): Promise<string>;
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
  setDefaultTimeout(timeout: number): void;
  title(): Promise<string>;
  url(): string;
}

export interface BrowserLocator {
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
  allInnerTexts(): Promise<string[]>;
  allTextContents(): Promise<string[]>;
  getAttribute(
    name: string,
    options?: BrowserLocatorReadOptions
  ): Promise<null | string>;
  innerHTML(options?: BrowserLocatorReadOptions): Promise<string>;
  innerText(options?: BrowserLocatorReadOptions): Promise<string>;
  inputValue(options?: BrowserLocatorReadOptions): Promise<string>;
  isChecked(options?: BrowserLocatorReadOptions): Promise<boolean>;
  isDisabled(options?: BrowserLocatorReadOptions): Promise<boolean>;
  isEditable(options?: BrowserLocatorReadOptions): Promise<boolean>;
  isEnabled(options?: BrowserLocatorReadOptions): Promise<boolean>;
  isHidden(options?: BrowserLocatorVisibilityOptions): Promise<boolean>;
  isVisible(options?: BrowserLocatorVisibilityOptions): Promise<boolean>;
  textContent(options?: BrowserLocatorReadOptions): Promise<null | string>;
  ariaSnapshot(options?: BrowserAriaSnapshotOptions): Promise<string>;
  fill(value: string, options?: BrowserLocatorFillOptions): Promise<void>;
  press(key: string, options?: BrowserLocatorPressOptions): Promise<void>;
  click(options?: BrowserLocatorClickOptions): Promise<void>;
  waitFor(options?: BrowserLocatorWaitForOptions): Promise<void>;
}

export type BrowserPageOptions = {
  browserWindow?: Window;
  onTrace?: () => void;
  pacing?: BrowserInteractionPacing;
};

export type BrowserInteractionPacing = {
  beforeActionMs?: number;
  clickCue?: boolean;
  typingIntervalMs?: number;
};

export type BrowserPageRuntime = {
  page: BrowserPage;
  trace: TraceEntry[];
  resetTrace(): void;
};

class BrowserLocatorImpl implements BrowserLocator {
  constructor(
    private readonly ownerPage: BrowserPageImpl,
    private readonly resolver: (scope?: Element) => Element[],
    private readonly label: string,
    private readonly trace: TraceEntry[],
    private readonly onTrace: (() => void) | undefined,
    private readonly selector: string
  ) {}

  belongsTo(page: BrowserPageImpl) {
    return this.ownerPage === page;
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
        : resolveLocatorSelector(selectorOrLocator, this.ownerPage);
    const composedSelector = appendLocatorOptions(
      selector,
      options,
      this.ownerPage
    );
    const locatorSelector = appendLocatorOptions(
      typeof selectorOrLocator === "string"
        ? `${this.selector} >> ${selector}`
        : `${this.selector} >> internal:chain=${JSON.stringify(selector)}`,
      options,
      this.ownerPage
    );
    return this.createFinder(
      composedSelector,
      `${this.label}.locator(${JSON.stringify(selector)})`,
      locatorSelector
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
      this.onTrace,
      appendLocatorOptions(this.selector, options, this.ownerPage)
    );
  }

  and(locator: BrowserLocator) {
    const locatorSelector = resolveLocatorSelector(locator, this.ownerPage);
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
      this.onTrace,
      `${this.selector} >> internal:and=${JSON.stringify(locatorSelector)}`
    );
  }

  or(locator: BrowserLocator): BrowserLocator {
    const locatorSelector = resolveLocatorSelector(locator, this.ownerPage);
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) =>
        sortInDocumentOrder([
          ...this.resolveElements(scope),
          ...resolveLocatorElements(locator, scope, this.ownerPage),
        ]),
      `${this.label}.or(...)`,
      this.trace,
      this.onTrace,
      `${this.selector} >> internal:or=${JSON.stringify(locatorSelector)}`
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

  private createFinder(
    selector: string,
    label: string,
    locatorSelector = `${this.selector} >> ${selector}`
  ) {
    return new BrowserLocatorImpl(
      this.ownerPage,
      (scope) =>
        this.ownerPage.querySelectorAll(selector, this.resolveElements(scope)),
      label,
      this.trace,
      this.onTrace,
      locatorSelector
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
      this.onTrace,
      `${this.selector} >> nth=${index}`
    );
  }

  async all() {
    const count = this.resolveElements().length;
    return Array.from({ length: count }, (_, index) => this.nth(index));
  }

  async count() {
    return this.resolveElements().length;
  }

  async allInnerTexts() {
    return this.resolveElements().map((element) => getInnerText(element));
  }

  async allTextContents() {
    return this.resolveElements().map((element) => element.textContent ?? "");
  }

  async getAttribute(name: string, options?: BrowserLocatorReadOptions) {
    return (await this.waitForSingleElement(options)).getAttribute(name);
  }

  async innerHTML(options?: BrowserLocatorReadOptions) {
    return (await this.waitForSingleElement(options)).innerHTML;
  }

  async innerText(options?: BrowserLocatorReadOptions) {
    return getInnerText(await this.waitForSingleElement(options));
  }

  async inputValue(options?: BrowserLocatorReadOptions) {
    const element = retargetToControl(await this.waitForSingleElement(options));
    if (!isInputValueElement(element))
      throw new Error("Node is not an <input>, <textarea> or <select> element");
    return element.value;
  }

  async isChecked(options?: BrowserLocatorReadOptions) {
    return this.elementState(
      await this.waitForSingleElement(options),
      "checked"
    );
  }

  async isDisabled(options?: BrowserLocatorReadOptions) {
    return this.elementState(
      await this.waitForSingleElement(options),
      "disabled"
    );
  }

  async isEditable(options?: BrowserLocatorReadOptions) {
    return this.elementState(
      await this.waitForSingleElement(options),
      "editable"
    );
  }

  async isEnabled(options?: BrowserLocatorReadOptions) {
    return this.elementState(
      await this.waitForSingleElement(options),
      "enabled"
    );
  }

  async isHidden(options?: BrowserLocatorVisibilityOptions) {
    return !(await this.isVisible(options));
  }

  async isVisible(options?: BrowserLocatorVisibilityOptions) {
    void options;
    const element = this.resolveSingleElement();
    return element
      ? this.ownerPage.injectedScript.elementState(element, "visible").matches
      : false;
  }

  async textContent(options?: BrowserLocatorReadOptions) {
    return (await this.waitForSingleElement(options)).textContent;
  }

  async fill(value: string, options?: BrowserLocatorFillOptions) {
    // Browser-emulated: Playwright actionability, trusted input, and navigation
    // waiting are intentionally outside this package's promise.
    void options;
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

  async click(options?: BrowserLocatorClickOptions) {
    // Browser-emulated: DOM click has no Playwright device-input or navigation
    // waiting semantics, and accepted actionability options are not promises.
    void options;
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

  async press(key: string, options?: BrowserLocatorPressOptions) {
    // Browser-emulated: these are synthetic keyboard events, not trusted device
    // input, and actionability/navigation options are intentionally unpromised.
    void options;
    this.record({ operation: "press", locator: this.label, key });
    await this.ownerPage.waitBeforeAction();
    const element = this.requireSingleElement();
    if (element instanceof HTMLElement || element instanceof SVGElement)
      element.focus();
    const keydown = dispatchKeyboardEvent(element, "keydown", key);
    dispatchKeyboardEvent(element, "keypress", key);
    dispatchKeyboardEvent(element, "keyup", key);

    if (
      key === "Enter" &&
      !keydown.defaultPrevented &&
      element instanceof HTMLInputElement
    )
      element.form?.requestSubmit();
  }

  async ariaSnapshot(options: BrowserAriaSnapshotOptions = {}) {
    if (options.mode === "ai") {
      throwIfAborted(options.signal);
      return this.ownerPage.captureAriaSnapshot(
        this.requireSingleElement(),
        options
      );
    }
    const element = await this.ownerPage.waitForLocator(
      () => this.resolveElements(),
      this.label,
      options
    );
    return this.ownerPage.captureAriaSnapshot(element, options);
  }

  async waitFor(options: BrowserLocatorWaitForOptions = {}) {
    const state = options.state ?? "visible";
    this.record({
      operation: "waitFor",
      locator: this.label,
      state,
    });
    await this.ownerPage.waitForLocator(
      () => this.resolveElements(),
      this.label,
      { ...options, state }
    );
  }

  resolveElements(scope?: Element) {
    return this.resolver(scope).filter(isElement);
  }

  private elementState(element: Element, state: string) {
    return this.ownerPage.injectedScript.elementState(element, state).matches;
  }

  private waitForSingleElement(options: BrowserLocatorReadOptions = {}) {
    return this.ownerPage.waitForLocator(
      () => this.resolveElements(),
      this.label,
      { ...options, state: "attached" }
    );
  }

  private requireSingleElement() {
    const first = this.resolveSingleElement();
    if (!first) throw new Error(`No elements found for locator ${this.label}`);
    return first;
  }

  private resolveSingleElement() {
    const elements = this.resolveElements();
    if (elements.length > 1)
      throw new Error(
        `Expected one element for locator ${this.label}, found ${elements.length}`
      );
    return elements[0];
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

class BrowserPageImpl implements BrowserPage {
  readonly document: Document;
  readonly window: Window;
  readonly injectedScript: InjectedScript;
  private defaultTimeout = 0;

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
        stableRafCount: 1,
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

  async ariaSnapshot(options: BrowserAriaSnapshotOptions = {}) {
    const body = await this.waitForLocator(
      () => (this.document.body ? [this.document.body] : []),
      "page",
      options
    );
    return this.captureAriaSnapshot(body, options);
  }

  async content() {
    const doctype = this.document.doctype
      ? new (
          this.window as Window & typeof globalThis
        ).XMLSerializer().serializeToString(this.document.doctype)
      : "";
    return `${doctype}${this.document.documentElement.outerHTML}`;
  }

  setDefaultTimeout(timeout: number) {
    if (!Number.isFinite(timeout) || timeout < 0)
      throw new Error("Timeout must be a non-negative finite number.");
    this.defaultTimeout = timeout;
  }

  async title() {
    return this.document.title;
  }

  url() {
    return this.window.location.href;
  }

  captureAriaSnapshot(element: Element, options: BrowserAriaSnapshotOptions) {
    throwIfAborted(options.signal);
    return this.injectedScript.ariaSnapshot(element, {
      boxes: options.boxes,
      depth: options.depth,
      mode: options.mode ?? "default",
    });
  }

  async waitForLocator(
    resolve: () => Element[],
    label: string,
    options: BrowserLocatorWaitForOptions | BrowserAriaSnapshotOptions
  ) {
    const state =
      "state" in options ? (options.state ?? "visible") : "attached";
    const timeout = options.timeout ?? this.defaultTimeout;
    const deadline =
      timeout === 0 ? undefined : this.window.performance.now() + timeout;

    return new Promise<Element>((resolvePromise, reject) => {
      let timeoutHandle: number | undefined;
      let settled = false;
      const observer = new MutationObserver(() => check());
      const signal = options.signal;

      const finish = (error?: unknown, element?: Element) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        if (timeoutHandle !== undefined)
          this.window.clearTimeout(timeoutHandle);
        signal?.removeEventListener("abort", onAbort);
        if (error !== undefined) reject(error);
        else resolvePromise(element as Element);
      };

      const onAbort = () => finish(abortError(signal?.reason));

      const check = () => {
        if (settled) return;
        try {
          throwIfAborted(signal);
          const elements = resolve();
          if (elements.length > 1)
            throw new Error(
              `strict mode violation: ${label} resolved to ${elements.length} elements`
            );
          const element = elements[0];
          if (locatorStateMatches(this.injectedScript, element, state)) {
            finish(undefined, element);
            return;
          }
          if (
            deadline !== undefined &&
            this.window.performance.now() >= deadline
          ) {
            finish(
              timeoutError(`Timed out waiting for ${label} to become ${state}.`)
            );
            return;
          }
          if (timeoutHandle !== undefined)
            this.window.clearTimeout(timeoutHandle);
          timeoutHandle = this.window.setTimeout(check, 10);
        } catch (error) {
          finish(error);
        }
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      observer.observe(this.document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      check();
    });
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
    const composedSelector = appendLocatorOptions(selector, options, this);
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
    selector: string
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

export function createBrowserPage(
  options: BrowserPageOptions = {}
): BrowserPageRuntime {
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

function getInnerText(element: Element) {
  if (element.namespaceURI !== "http://www.w3.org/1999/xhtml")
    throw new Error("Node is not an HTMLElement");
  return (element as HTMLElement).innerText ?? element.textContent ?? "";
}

function retargetToControl(element: Element) {
  if (isInputValueElement(element)) return element;
  const label = element.closest("label");
  if (label?.nodeName === "LABEL")
    return (label as HTMLLabelElement).control ?? element;
  return element;
}

function isInputValueElement(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.nodeName);
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
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

function resolveLocatorElements(
  locator: BrowserLocator,
  scope?: Element,
  ownerPage?: BrowserPageImpl
): Element[] {
  if (locator instanceof BrowserLocatorImpl) {
    if (ownerPage !== undefined && !locator.belongsTo(ownerPage))
      throw new Error("Locators must belong to the same BrowserPage.");
    return locator.resolveElements(scope);
  }
  throw new Error(
    "Unsupported locator implementation. Use the Ayme browser runtime."
  );
}

function resolveLocatorSelector(
  locator: BrowserLocator,
  ownerPage: BrowserPageImpl
): string {
  if (locator instanceof BrowserLocatorImpl) {
    if (!locator.belongsTo(ownerPage))
      throw new Error("Locators must belong to the same BrowserPage.");
    return locator.getSelector();
  }
  throw new Error(
    "Unsupported locator implementation. Use the Ayme browser runtime."
  );
}

function appendLocatorOptions(
  selector: string,
  options: BrowserLocatorFilterOptions,
  ownerPage: BrowserPageImpl
) {
  if (options.hasText)
    selector += ` >> internal:has-text=${escapeForTextSelector(options.hasText, false)}`;
  if (options.hasNotText)
    selector += ` >> internal:has-not-text=${escapeForTextSelector(options.hasNotText, false)}`;
  if (options.has)
    selector += ` >> internal:has=${JSON.stringify(resolveLocatorSelector(options.has, ownerPage))}`;
  if (options.hasNot)
    selector += ` >> internal:has-not=${JSON.stringify(resolveLocatorSelector(options.hasNot, ownerPage))}`;
  if (options.visible !== undefined)
    selector += ` >> visible=${options.visible ? "true" : "false"}`;
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

function locatorStateMatches(
  injectedScript: InjectedScript,
  element: Element | undefined,
  state: "attached" | "detached" | "visible" | "hidden"
) {
  if (state === "detached") return element === undefined;
  if (!element) return state === "hidden";
  if (state === "attached") return true;
  return injectedScript.elementState(element, state).matches;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw abortError(signal.reason);
}

function abortError(reason?: unknown) {
  const cause =
    reason === undefined
      ? new DOMException("This operation was aborted", "AbortError")
      : reason;
  const error = new Error(
    cause instanceof Error ? cause.message : String(cause),
    { cause }
  );
  error.name = "AbortError";
  return error;
}

function timeoutError(message: string) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}
