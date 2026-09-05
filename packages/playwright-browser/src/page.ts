import { injectedScriptFor } from "./injected";
import type { ByRoleOptions, LocatorOptions } from "./locator";
import { LocatorImpl } from "./locator";
import {
  getByAltTextSelector,
  getByLabelSelector,
  getByPlaceholderSelector,
  getByRoleSelector,
  getByTestIdSelector,
  getByTextSelector,
  getByTitleSelector,
} from "./selectors";

import type { BrowserInteractionPacing, TraceEntry } from "./types";

type InjectedExpectation = {
  matches: boolean;
  received?: { value?: unknown; ariaSnapshot?: string };
};

type LocatorExpectationResult = {
  matches: boolean;
  received?: { value?: unknown; ariaSnapshot?: string };
  timedOut?: boolean;
  errorMessage?: string;
  log?: string[];
};

type LocatorExpectationOptions = Record<string, unknown> & {
  isNot?: boolean;
  signal?: AbortSignal;
  timeout?: number;
};

type LocatorExpectationAttempt = {
  matches: boolean;
  received?: { value?: unknown; ariaSnapshot?: string };
  missing: boolean;
};

const DEFAULT_EXPECT_TIMEOUT = 5_000;
const EXPECT_RETRY_BACKOFF = [20, 50, 100, 100, 500];
const DEFAULT_ACTION_TIMEOUT = 1_000;
const ACTION_RETRY_DELAY = 50;
const DEFAULT_QUERY_TIMEOUT = 0;
const QUERY_RETRY_DELAY = 50;

type ActionPoint = { x: number; y: number };
type ActionTarget = { element: Element; point: ActionPoint };

export type SelectorQueryOptions = {
  signal?: AbortSignal;
  strict?: boolean;
  timeout?: number;
};

export type LocatorQueryOptions = Omit<SelectorQueryOptions, "strict">;

export type AriaSnapshotOptions = {
  boxes?: boolean;
  depth?: number;
  mode?: "ai" | "default";
  signal?: AbortSignal;
  timeout?: number;
};

type QueryState = "enabled" | "disabled" | "checked";

type QueryStateResult =
  | { matches: boolean; received: string }
  | { matches: false; received: "error:notconnected" };

type QueryCapableInjectedScript = {
  elementState(element: Element, state: QueryState): QueryStateResult;
  retarget(element: Element, behavior: "follow-label"): Element | null;
};

type ExpectCapableInjectedScript = {
  expect(
    element: Element | undefined,
    options: { expression: string } & Record<string, unknown>,
    elements: Element[]
  ): Promise<InjectedExpectation>;
};

type ActionableInjectedScript = {
  checkElementStates(
    element: Element,
    states: ("visible" | "enabled" | "editable" | "stable")[]
  ): Promise<
    | "error:notconnected"
    | { missingState: "visible" | "enabled" | "editable" | "stable" }
    | undefined
  >;
  expectHitTarget(
    point: { x: number; y: number },
    element: Element
  ): "done" | { hitTargetDescription: string };
  fill(
    element: Element,
    value: string
  ): "error:notconnected" | "needsinput" | "done";
  focusNode(
    element: Element,
    resetSelectionIfNotFocused?: boolean
  ): "error:notconnected" | "done";
};

/**
 * Normalizes an expression the same way pinned b25d782
 * server/javascript.ts normalizeEvaluationExpression does:
 *   - isFunction=true: ensure the expression is a valid function expression
 *     (wrap in parens, or prefix `function` for shorthand methods)
 *   - Any expression matching /^(async)?\s*function(\s|\()/ gets parens
 */
function normalizeExpression(expression: string, isFunction: boolean): string {
  let expr = expression.trim();
  if (isFunction) {
    try {
      new Function("(" + expr + ")");
    } catch {
      if (expr.startsWith("async "))
        expr = "async function " + expr.substring("async ".length);
      else expr = "function " + expr;
      try {
        new Function("(" + expr + ")");
      } catch {
        throw new Error("Passed function is not well-serializable!");
      }
    }
  }
  if (/^(async)?\s*function(\s|\()/.test(expr)) expr = "(" + expr + ")";
  return expr;
}

/**
 * Minimal JSHandle mirroring pinned b25d782 client JSHandle interface.
 * Returned by waitForFunction so callers can use `.jsonValue()` /
 * `.dispose()` without a harness-only shim.
 */
export class AdapterJSHandle<T = unknown> {
  private _value: T;

  constructor(value: T) {
    this._value = value;
  }

  async jsonValue(): Promise<T> {
    return this._value;
  }

  async dispose(): Promise<void> {
    // No remote object to release in a single-document adapter.
  }
}

export class PageImpl {
  readonly document: Document;
  readonly window: Window & typeof globalThis;
  private _injected: ReturnType<typeof injectedScriptFor> | undefined;

  constructor(
    browserWindow: Window & typeof globalThis,
    private readonly onTrace?: (entry: TraceEntry) => void,
    private readonly pacing: BrowserInteractionPacing = {}
  ) {
    this.window = browserWindow;
    this.document = browserWindow.document;
  }

  private get injected() {
    if (!this._injected)
      this._injected = injectedScriptFor(this.document.documentElement);
    return this._injected;
  }

  static fromWindow(
    browserWindow: Window & typeof globalThis = window,
    onTrace?: (entry: TraceEntry) => void,
    pacing?: BrowserInteractionPacing
  ) {
    return new PageImpl(browserWindow, onTrace, pacing);
  }

  // ── Resolution ──────────────────────────────────────────────────

  resolveAll(selector: string): Element[] {
    const parsed = this.injected.parseSelector(selector);
    return this.injected.querySelectorAll(
      parsed,
      this.document.documentElement
    );
  }

  requireSingle(selector: string, label: string): Element {
    const elements = this.resolveAll(selector);
    const first = elements[0];
    if (!first) throw new Error(`No elements found for locator ${label}`);
    if (elements.length > 1)
      throw new Error(
        `Expected one element for locator ${label}, found ${elements.length}`
      );
    return first;
  }

  // ── State ───────────────────────────────────────────────────────

  elementState(element: Element, state: "visible" | "hidden") {
    return this.injected.elementState(element, state);
  }

  isInState(selector: string, state: "visible" | "hidden"): boolean {
    const elements = this.resolveAll(selector);
    if (state === "visible") {
      return elements.some(
        (el) => this.elementState(el, "visible")?.matches === true
      );
    }
    return elements.every(
      (el) => this.elementState(el, "visible")?.matches !== true
    );
  }

  // ── Selector query operations ──────────────────────────────────

  async getAttribute(
    selector: string,
    name: string,
    options?: SelectorQueryOptions
  ): Promise<string | null> {
    return this.query(
      selector,
      `page.getAttribute(${JSON.stringify(selector)}, ${JSON.stringify(name)})`,
      options,
      false,
      (element) => element.getAttribute(name)
    );
  }

  async textContent(
    selector: string,
    options?: SelectorQueryOptions
  ): Promise<string | null> {
    return this.query(
      selector,
      `page.textContent(${JSON.stringify(selector)})`,
      options,
      false,
      (element) => element.textContent
    );
  }

  async inputValue(
    selector: string,
    options?: SelectorQueryOptions
  ): Promise<string> {
    return this.query(
      selector,
      `page.inputValue(${JSON.stringify(selector)})`,
      options,
      false,
      (element) => this.inputValueFor(element)
    );
  }

  async isEnabled(
    selector: string,
    options?: SelectorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "enabled", options, false);
  }

  async isDisabled(
    selector: string,
    options?: SelectorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "disabled", options, false);
  }

  async isChecked(
    selector: string,
    options?: SelectorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "checked", options, false);
  }

  /**
   * Adapts the client Locator._expect protocol to InjectedScript.expect.
   *
   * Pinned b25d782 `Frame.expect` performs one check and then retries with
   * bounded backoff. InjectedScript remains responsible for each matcher
   * evaluation. This method only supplies the client/server orchestration that
   * is feasible within the controlled document.
   */
  async expect(
    selector: string,
    expression: string,
    options: Record<string, unknown>
  ): Promise<LocatorExpectationResult> {
    const expectOptions = options as LocatorExpectationOptions;
    const isNot = !!expectOptions.isNot;
    const timeout = expectationTimeout(expectOptions.timeout);
    const signal = expectOptions.signal;

    if (signal?.aborted) return abortedExpectationResult(isNot, signal);

    const deadline = Date.now() + timeout;

    // The pinned server performs an immediate check before entering its retry
    // loop. It lets already-matching assertions succeed even with tiny timeouts.
    const firstAttempt = await this.expectOnce(selector, expression, options);
    if (firstAttempt.matches !== isNot) return { matches: !isNot };

    let lastAttempt = firstAttempt;
    let retryIndex = 0;

    while (Date.now() < deadline) {
      const backoff = expectationBackoff(timeout, retryIndex++);
      const delay = Math.min(backoff, Math.max(0, deadline - Date.now()));
      if (
        delay > 0 &&
        !(await waitForExpectationRetry(this.window, delay, signal))
      )
        return abortedExpectationResult(isNot, signal!);

      if (signal?.aborted) return abortedExpectationResult(isNot, signal);

      lastAttempt = await this.expectOnce(selector, expression, options);
      if (lastAttempt.matches !== isNot) return { matches: !isNot };
    }

    return {
      matches: isNot,
      received: lastAttempt.received,
      timedOut: true,
      errorMessage: lastAttempt.missing
        ? "Error: element(s) not found"
        : undefined,
      log: [`waiting for locator(${JSON.stringify(selector)})`],
    };
  }

  private async expectOnce(
    selector: string,
    expression: string,
    options: Record<string, unknown>
  ): Promise<LocatorExpectationAttempt> {
    const expectOptions = options as LocatorExpectationOptions;
    const isArray =
      expression === "to.have.count" || expression.endsWith(".array");
    const elements = this.resolveAll(selector);

    if (!elements.length)
      return missingExpectationAttempt(expression, expectOptions);

    // Pinned Frame._expectInternal resolves non-array assertions strictly.
    if (!isArray && elements.length > 1)
      throw new Error(
        `strict mode violation: locator ${JSON.stringify(selector)} resolved to ${elements.length} elements`
      );

    const injectedOptions = Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => key !== "timeout" && key !== "signal"
      )
    );
    const injected = this.injected as typeof this.injected &
      ExpectCapableInjectedScript;
    const result = await injected.expect(
      elements[0],
      { expression, ...injectedOptions },
      elements
    );
    return {
      matches: result.matches,
      received: result.received,
      missing: false,
    };
  }

  async evaluateLocatorExpression<T extends Element | Element[]>(
    target: T,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expression: string | ((target: T, arg?: unknown) => any),
    isFunction: boolean,
    arg?: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (typeof expression === "function") return await expression(target, arg);
    const normalized = normalizeExpression(expression, isFunction);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evaluated: any = this.window.eval(normalized);
    if (isFunction) return await evaluated(target, arg);
    return evaluated;
  }

  // ── Terminal actions ────────────────────────────────────────────

  async click(selector: string, label: string) {
    let target = await this.retryActionability(
      selector,
      label,
      "click",
      ["visible", "enabled", "stable"],
      true
    );
    await this.waitBeforeClick(target.element);
    // The pacing cue can itself yield to the page, so use the same locator
    // retry path again before sending events.
    target = await this.retryActionability(
      selector,
      label,
      "click",
      ["visible", "enabled", "stable"],
      true
    );

    // Playwright drives a real mouse. A single-document adapter cannot create
    // trusted protocol events or full input-device hit-target interception.
    // Keep the click itself native: dispatching a second synthetic click would
    // duplicate handlers and lose browser default activation behavior.
    const { element, point } = target;
    this.dispatchPointerEvent(element, "pointerover", point, 0, 0, 0);
    this.dispatchPointerEvent(element, "pointerenter", point, 0, 0, 0, false);
    this.dispatchMouseEvent(element, "mouseover", point, 0, 0, 0);
    this.dispatchMouseEvent(element, "mouseenter", point, 0, 0, 0, false);
    this.dispatchPointerEvent(element, "pointermove", point, 0, 0, 0);
    this.dispatchMouseEvent(element, "mousemove", point, 0, 0, 0);
    const pointerDownAllowed = this.dispatchPointerEvent(
      element,
      "pointerdown",
      point,
      0,
      1,
      0
    );
    if (pointerDownAllowed) {
      const mouseDownAllowed = this.dispatchMouseEvent(
        element,
        "mousedown",
        point,
        0,
        1,
        1
      );
      if (mouseDownAllowed) this.focusElement(element);
    }
    this.dispatchPointerEvent(element, "pointerup", point, 0, 0, 0);
    if (pointerDownAllowed)
      this.dispatchMouseEvent(element, "mouseup", point, 0, 0, 1);

    if (isHtmlElement(element, this.window)) element.click();
    else this.dispatchMouseEvent(element, "click", point, 0, 0, 1);
  }

  async fill(selector: string, value: string, label: string) {
    await this.waitBeforeAction();
    const { element } = await this.retryActionability(
      selector,
      label,
      "fill",
      ["visible", "enabled", "editable"],
      false
    );

    // Pinned InjectedScript validates input types, normalizes settable values,
    // selects the current text, and performs the direct set-value path. It
    // deliberately returns `needsinput` for ordinary text entry; Playwright's
    // server then uses the browser keyboard. We provide that final local input
    // effect below, without reimplementing InjectedScript's validation.
    const result = this.actionableInjected.fill(element, value);
    if (result === "error:notconnected")
      throw new Error(`Element is not connected for locator ${label}`);
    if (result === "done") return;
    if (result !== "needsinput")
      throw new Error(`Unexpected fill result for locator ${label}: ${result}`);

    await this.insertFilledText(element, value);
  }

  async press(selector: string, key: string, label: string) {
    await this.waitBeforeAction();
    const element = this.requireSingle(selector, label);
    this.focusElement(element);

    const keys = parseKeyDescription(key);
    const modifiers = new Set<string>();
    for (const modifier of keys.slice(0, -1)) {
      modifiers.add(modifier.key);
      this.dispatchKeyboardEvent(element, "keydown", modifier, modifiers);
    }

    const target = keyWithModifiers(keys.at(-1)!, modifiers);
    const targetIsModifier = isModifier(target.key);
    if (targetIsModifier) modifiers.add(target.key);
    const text = textForKey(target, modifiers);

    const keyDownAllowed = this.dispatchKeyboardEvent(
      element,
      "keydown",
      target,
      modifiers
    );
    const keyPressAllowed =
      keyDownAllowed &&
      (text.length > 0 || target.key === "Enter") &&
      this.dispatchKeyboardEvent(element, "keypress", target, modifiers);

    if (keyDownAllowed) this.applyKeydownDefault(element, target, modifiers);
    if (keyPressAllowed && text) this.insertPressedText(element, text);
    if (keyPressAllowed && target.key === "Enter") this.pressEnter(element);

    if (targetIsModifier) modifiers.delete(target.key);
    const keyUpAllowed = this.dispatchKeyboardEvent(
      element,
      "keyup",
      target,
      modifiers
    );
    if (keyDownAllowed && keyUpAllowed)
      this.applyKeyupDefault(element, target, modifiers);
    for (const modifier of keys.slice(0, -1).reverse()) {
      modifiers.delete(modifier.key);
      this.dispatchKeyboardEvent(element, "keyup", modifier, modifiers);
    }
  }

  async waitForState(
    selector: string,
    options: { state: "visible" | "hidden"; timeout?: number },
    label: string
  ) {
    const timeout = options.timeout ?? 1_000;

    if (this.isInState(selector, options.state)) return;

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + timeout;
      let timeoutHandle: number | undefined;
      const observer = new MutationObserver(() => check());

      const finish = (error?: Error) => {
        observer.disconnect();
        if (timeoutHandle !== undefined)
          this.window.clearTimeout(timeoutHandle);
        if (error) reject(error);
        else resolve();
      };

      const check = () => {
        if (this.isInState(selector, options.state)) {
          finish();
          return;
        }
        if (Date.now() >= deadline) {
          finish(
            new Error(
              `Timed out waiting for ${label} to become ${options.state}.`
            )
          );
          return;
        }
        timeoutHandle = this.window.setTimeout(check, 10);
      };

      observer.observe(this.document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      timeoutHandle = this.window.setTimeout(check, 0);
    });
  }

  // ── Pacing ──────────────────────────────────────────────────────

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

  // ── Setup operations ─────────────────────────────────────────────

  /**
   * Serializes the controlled document.
   *
   * Mirrors pinned b25d782 `server/frames.ts` Frame._content: serialize the
   * document type separately, then append documentElement.outerHTML. This is
   * intentionally a browser-native observation, rather than a reconstruction
   * of the markup supplied to setContent, so DOM mutations remain visible.
   */
  async content(): Promise<string> {
    let content = "";
    if (this.document.doctype)
      content = new this.window.XMLSerializer().serializeToString(
        this.document.doctype
      );
    if (this.document.documentElement)
      content += this.document.documentElement.outerHTML;
    return content;
  }

  /**
   * The browser runtime controls exactly one document, so that document is
   * also its main frame. Child-frame traversal remains unsupported.
   */
  mainFrame() {
    return this;
  }

  /**
   * Replaces the controlled document's content.
   *
   * Mirrors pinned b25d782 server/frames.ts:962-987:
   *   context.evaluate(({ html, tag }) => {
   *     document.open(); console.debug(tag);
   *     document.write(html); document.close();
   *   }, { html, tag });
   *
   * Uses the real document.open/write/close sequence so that inline
   * `<script>` tags execute and document-level attributes are preserved,
   * matching browser-native Playwright behaviour.
   *
   * waitUntil defaults to 'load' per pinned client/frame.ts:277.
   * 'networkidle' is rejected before mutation — the single-document
   * adapter cannot monitor network activity.
   * 'commit' resolves immediately after the write.
   * 'domcontentloaded' waits for DOMContentLoaded.
   * 'load' (default) waits for the load event.
   * timeout races against the wait (pinned server/frames.ts:963-984).
   */
  async setContent(
    html: string,
    options?: { timeout?: number; waitUntil?: string }
  ) {
    const waitUntil = options?.waitUntil ?? "load";

    // Reject unsupported states BEFORE mutation per user review.
    if (waitUntil === "networkidle")
      throw new Error(
        "networkidle is not supported by the single-document adapter"
      );
    const validStates = ["load", "domcontentloaded", "commit"];
    if (!validStates.includes(waitUntil))
      throw new Error(`Unsupported waitUntil value: ${waitUntil}`);

    this.document.open();
    this.document.write(html);
    this.document.close();
    // Re-acquire InjectedScript since the document was replaced.
    this._injected = undefined;

    // 'commit' — resolve immediately after the write.
    if (waitUntil === "commit") return;

    // Wait for the requested lifecycle event with optional timeout.
    const eventName =
      waitUntil === "domcontentloaded" ? "DOMContentLoaded" : "load";
    const timeout = options?.timeout;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: number | undefined;

      const handler = () => settle();

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) this.window.clearTimeout(timeoutId);
        // Remove the lifecycle listener to prevent leaks after timeout.
        this.window.removeEventListener(eventName, handler);
        if (err) reject(err);
        else resolve();
      };

      // Check if the event already fired (readyState).
      if (eventName === "DOMContentLoaded") {
        if (
          this.document.readyState === "interactive" ||
          this.document.readyState === "complete"
        ) {
          settle();
          return;
        }
      } else if (eventName === "load") {
        if (this.document.readyState === "complete") {
          settle();
          return;
        }
      }

      this.window.addEventListener(eventName, handler, { once: true });

      if (timeout !== undefined && timeout > 0)
        timeoutId = this.window.setTimeout(
          () =>
            settle(
              new Error(`page.setContent: Timeout ${timeout}ms exceeded.`)
            ),
          timeout
        );
    });
  }

  // ── Accessibility ───────────────────────────────────────────────

  /**
   * Captures the accessibility snapshot for the controlled document.
   *
   * Pinned b25d782 `Page.ariaSnapshot` delegates to the main frame. The
   * single-document adapter has that frame in-process, so it delegates
   * directly to the compiled InjectedScript which owns ARIA-tree generation
   * and rendering. There is no frame traversal or protocol transport here.
   */
  async ariaSnapshot(options: AriaSnapshotOptions = {}): Promise<string> {
    // Pinned `ariaSnapshotForFrame` resolves `body,frameset`, rather than
    // documentElement, so the document wrapper itself is not rendered.
    return this.injectedAriaSnapshot(
      this.document.body ?? this.document.documentElement,
      options
    );
  }

  injectedAriaSnapshot(
    element: Element,
    options: AriaSnapshotOptions = {}
  ): string {
    return this.injected.ariaSnapshot(element, {
      mode: options.mode ?? "default",
      depth: options.depth,
      boxes: options.boxes,
    });
  }

  // ── Evaluate / callback operations ──────────────────────────────

  /**
   * Executes a function or expression in the controlled document.
   *
   * Mirrors pinned b25d782 client/frame.ts:217-223 + server/javascript.ts:
   *   Client sends { expression: String(pageFunction),
   *                   isFunction: typeof pageFunction === 'function',
   *                   arg: serializeArgument(arg) }
   *   Server normalizes the expression, evals it once, and:
   *     isFunction=true  → calls the result with arg
   *     isFunction=false → returns the result directly
   *
   * For direct in-browser callers the function is called immediately.
   * For bridge-transported strings the isFunction flag is explicit.
   * Never retries evaluation after a runtime exception.
   */
  async evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageFunction: string | ((...a: any[]) => any),
    arg?: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const isFunction = typeof pageFunction === "function";
    return this._evaluateExpression(
      isFunction ? pageFunction : String(pageFunction),
      isFunction,
      arg
    );
  }

  /**
   * Internal expression evaluator mirroring server/javascript.ts
   * normalizeEvaluationExpression + evaluate flow.
   *
   * @param expression  String(pageFunction) or the raw function reference
   * @param isFunction  true → call the evaled result with arg;
   *                    false → return the evaled result directly
   * @param arg         serialized argument
   */
  async _evaluateExpression(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expression: string | ((...a: any[]) => any),
    isFunction: boolean,
    arg?: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (typeof expression === "function") return await expression(arg);
    // Normalize: wrap function expressions in parens per
    // server/javascript.ts normalizeEvaluationExpression.
    const normalized = normalizeExpression(expression, isFunction);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evaled: any = this.window.eval(normalized);
    if (isFunction) return await evaled(arg);
    return evaled;
  }

  /**
   * Polls a predicate in the controlled document until it returns a
   * truthy value.
   *
   * Mirrors pinned b25d782 server/frames.ts:1626-1694:
   *   - pollingInterval must be >0 (frames.ts:1628)
   *   - expression is normalized (frames.ts:1629)
   *   - isFunction=true  → eval once, call each poll (frames.ts:1640-1642)
   *   - isFunction=false → re-eval each poll (frames.ts:1643-1644,
   *     since evaledExpression is never cached)
   *   - abort mechanism cleans up pending timers (frames.ts:1679-1681)
   *   - timeout races independently (handles never-settling predicates)
   *
   * Returns a minimal handle with `jsonValue()` and `dispose()`,
   * mirroring pinned client JSHandle interface.
   */
  /**
   * Public API: derives isFunction from typeof pageFunction.
   */
  async waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageFunction: string | ((...a: any[]) => any),
    arg?: unknown,
    options?: { polling?: number | "raf"; timeout?: number }
  ): Promise<AdapterJSHandle> {
    return this._waitForFunctionExpression(
      typeof pageFunction === "function" ? pageFunction : String(pageFunction),
      typeof pageFunction === "function",
      arg,
      options
    );
  }

  /**
   * Internal: accepts explicit isFunction for bridge transport.
   *
   * Mirrors pinned b25d782 server/frames.ts:1626-1694:
   *   - pollingInterval must be >0 (frames.ts:1628)
   *   - expression is normalized (frames.ts:1629)
   *   - isFunction=true  → eval once, call each poll (frames.ts:1640-1642)
   *   - isFunction=false → re-eval each poll (frames.ts:1643-1644,
   *     since evaledExpression is never cached)
   *   - abort mechanism cleans up pending timers (frames.ts:1679-1681)
   *   - timeout races independently (handles never-settling predicates)
   */
  async _waitForFunctionExpression(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageFunction: string | ((...a: any[]) => any),
    isFunction: boolean,
    arg?: unknown,
    options?: { polling?: number | "raf"; timeout?: number }
  ): Promise<AdapterJSHandle> {
    const timeout = options?.timeout ?? 30_000;
    const polling = options?.polling ?? "raf";

    // Validate polling per frames.ts:1628
    if (typeof polling === "string" && polling !== "raf")
      throw new Error("Unknown polling option: " + polling);
    if (typeof polling === "number" && polling <= 0)
      throw new Error("Cannot poll with non-positive interval: " + polling);

    // For function references, call directly; for strings, normalize.
    const expression =
      typeof pageFunction === "function"
        ? pageFunction
        : normalizeExpression(String(pageFunction), isFunction);

    return new Promise<AdapterJSHandle>((resolve, reject) => {
      let aborted = false;
      let timeoutId: number | undefined;
      let pollTimerId: number | undefined;
      let rafId: number | undefined;

      // Independent timeout timer — rejects even if predicate never settles.
      if (timeout > 0) {
        timeoutId = this.window.setTimeout(() => {
          cleanup();
          reject(new Error("Timeout exceeded while waiting for function"));
        }, timeout);
      }

      const cleanup = () => {
        aborted = true;
        if (timeoutId !== undefined) this.window.clearTimeout(timeoutId);
        if (pollTimerId !== undefined) this.window.clearTimeout(pollTimerId);
        if (rafId !== undefined) this.window.cancelAnimationFrame(rafId);
      };

      // Cache the evaled function for isFunction=true (frames.ts:1641).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let evaledFunction: ((...a: any[]) => any) | undefined;

      const predicate = () => {
        if (typeof expression === "function") return expression(arg);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any = evaledFunction ?? this.window.eval(expression);
        if (isFunction) {
          evaledFunction = result;
          result = result(arg);
        }
        // isFunction=false: result is already the expression value,
        // re-evaluated each poll because evaledFunction is never set.
        return result;
      };

      const check = () => {
        if (aborted) return;
        try {
          const result = predicate();
          if (
            result &&
            typeof (result as Promise<unknown>)?.then === "function"
          ) {
            (result as Promise<unknown>).then(
              (v) => {
                if (aborted) return;
                if (v) {
                  cleanup();
                  resolve(new AdapterJSHandle(v));
                } else {
                  scheduleNext();
                }
              },
              (e) => {
                if (aborted) return;
                cleanup();
                reject(e);
              }
            );
            return;
          }
          if (result) {
            cleanup();
            resolve(new AdapterJSHandle(result));
            return;
          }
        } catch (e) {
          cleanup();
          reject(e);
          return;
        }
        scheduleNext();
      };

      const scheduleNext = () => {
        if (aborted) return;
        if (polling === "raf") rafId = this.window.requestAnimationFrame(check);
        else pollTimerId = this.window.setTimeout(check, polling as number);
      };

      check();
    });
  }

  // ── Locator creation ────────────────────────────────────────────

  getByRole(role: string, options: ByRoleOptions = {}) {
    const roleSelector = getByRoleSelector(role, options);
    const optString =
      options.name !== undefined ? `, ${JSON.stringify(options)}` : "";
    return new LocatorImpl(
      this,
      roleSelector,
      `page.getByRole(${JSON.stringify(role)}${optString})`,
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

  locator(selector: string, options?: LocatorOptions) {
    return new LocatorImpl(
      this,
      selector,
      `page.locator(${JSON.stringify(selector)})`,
      this.onTrace,
      options
    );
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async wait(durationMs: number | undefined) {
    if (!durationMs || durationMs <= 0) return;
    await new Promise<void>((resolve) =>
      this.window.setTimeout(resolve, durationMs)
    );
  }

  async locatorGetAttribute(
    selector: string,
    label: string,
    name: string,
    options?: LocatorQueryOptions
  ): Promise<string | null> {
    return this.query(selector, label, options, true, (element) =>
      element.getAttribute(name)
    );
  }

  async locatorTextContent(
    selector: string,
    label: string,
    options?: LocatorQueryOptions
  ): Promise<string | null> {
    return this.query(
      selector,
      label,
      options,
      true,
      (element) => element.textContent
    );
  }

  async locatorInputValue(
    selector: string,
    label: string,
    options?: LocatorQueryOptions
  ): Promise<string> {
    return this.query(selector, label, options, true, (element) =>
      this.inputValueFor(element)
    );
  }

  async locatorIsEnabled(
    selector: string,
    label: string,
    options?: LocatorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "enabled", options, true, label);
  }

  async locatorIsDisabled(
    selector: string,
    label: string,
    options?: LocatorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "disabled", options, true, label);
  }

  async locatorIsChecked(
    selector: string,
    label: string,
    options?: LocatorQueryOptions
  ): Promise<boolean> {
    return this.queryState(selector, "checked", options, true, label);
  }

  private async queryState(
    selector: string,
    state: QueryState,
    options: SelectorQueryOptions | LocatorQueryOptions | undefined,
    strict: boolean,
    label = `page.is${state[0].toUpperCase()}${state.slice(1)}(${JSON.stringify(selector)})`
  ): Promise<boolean> {
    return this.query(selector, label, options, strict, (element) => {
      const result = (
        this.injected as typeof this.injected & QueryCapableInjectedScript
      ).elementState(element, state);
      if (result.received === "error:notconnected")
        throw new Error("Element is not connected");
      return result.matches;
    });
  }

  private inputValueFor(element: Element): string {
    const target = (
      this.injected as typeof this.injected & QueryCapableInjectedScript
    ).retarget(element, "follow-label");
    if (!target) throw new Error("Element is not connected");
    if (
      !(target instanceof this.window.HTMLInputElement) &&
      !(target instanceof this.window.HTMLTextAreaElement) &&
      !(target instanceof this.window.HTMLSelectElement)
    )
      throw new Error("Node is not an <input>, <textarea> or <select> element");
    return target.value;
  }

  private async query<T>(
    selector: string,
    label: string,
    options: SelectorQueryOptions | LocatorQueryOptions | undefined,
    strict: boolean,
    evaluate: (element: Element) => T
  ): Promise<T> {
    assertQueryOptions(options, !strict);
    const timeout = queryTimeout(options?.timeout);
    const signal = options?.signal;
    if (signal?.aborted) throw queryAborted(signal);
    const deadline = timeout === 0 ? Infinity : Date.now() + timeout;

    while (true) {
      try {
        const element = this.queryElement(
          selector,
          label,
          strict ||
            (options as SelectorQueryOptions | undefined)?.strict === true
        );
        return evaluate(element);
      } catch (error) {
        if (!isRetryableQueryError(error)) throw error;
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error(
            `Timeout ${timeout}ms exceeded while waiting for locator ${label}`,
            { cause: error }
          );
        const delay = Math.min(QUERY_RETRY_DELAY, remaining);
        if (!(await waitForExpectationRetry(this.window, delay, signal)))
          throw queryAborted(signal!);
      }
    }
  }

  private queryElement(selector: string, label: string, strict: boolean) {
    const elements = this.resolveAll(selector);
    const first = elements[0];
    if (!first) throw new Error(`No elements found for locator ${label}`);
    if (strict && elements.length > 1)
      throw new Error(
        `Expected one element for locator ${label}, found ${elements.length}`
      );
    return first;
  }

  private async ensureActionable(
    element: Element,
    states: ("visible" | "enabled" | "editable" | "stable")[]
  ) {
    const result = await this.actionableInjected.checkElementStates(
      element,
      states
    );
    if (!result) return;
    if (result === "error:notconnected")
      throw new Error("Element is not connected");
    throw new Error(`Element is not ${result.missingState}`);
  }

  private async retryActionability(
    selector: string,
    label: string,
    actionName: "click" | "fill",
    states: ("visible" | "enabled" | "editable" | "stable")[],
    checkHitTarget: boolean
  ): Promise<ActionTarget> {
    const deadline = Date.now() + DEFAULT_ACTION_TIMEOUT;
    let lastError: Error | undefined;

    while (true) {
      try {
        const element = this.requireSingle(selector, label);
        await this.ensureActionable(element, states);
        this.scrollIntoView(element);
        // Scrolling can change visibility or expose a covering element.
        await this.ensureActionable(element, states);
        const point = checkHitTarget
          ? this.ensureReceivesEvents(element)
          : centerPoint(element);
        return { element, point };
      } catch (error) {
        if (!isRetryableActionError(error)) throw error;
        lastError = asError(error);
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error(
            `${actionName}: Timeout ${DEFAULT_ACTION_TIMEOUT}ms exceeded. ${lastError.message}`,
            { cause: error }
          );
        await this.wait(Math.min(ACTION_RETRY_DELAY, remaining));
      }
    }
  }

  private scrollIntoView(element: Element) {
    if (typeof element.scrollIntoView !== "function") return;
    element.scrollIntoView({ block: "center", inline: "center" });
  }

  private ensureReceivesEvents(element: Element): ActionPoint {
    const rect = element.getBoundingClientRect();
    // Layoutless DOM environments have no meaningful hit point. The pinned
    // primitive remains the authority whenever a browser supplies geometry.
    const point = centerPoint(element);
    if (
      !rect.width ||
      !rect.height ||
      typeof this.document.elementFromPoint !== "function"
    )
      return point;
    const result = this.actionableInjected.expectHitTarget(point, element);
    if (result !== "done")
      throw new Error(
        `Element does not receive pointer events: ${result.hitTargetDescription}`
      );
    return point;
  }

  private focusElement(element: Element) {
    this.actionableInjected.focusNode(element, true);
  }

  private async insertFilledText(element: Element, value: string) {
    if (!this.shouldTypeCharacterByCharacter()) {
      this.replaceSelectedText(element, value);
      return;
    }

    this.replaceSelectedText(element, "");
    for (const character of value) {
      this.replaceSelectedText(element, character);
      await this.waitBetweenTypedCharacters();
    }
  }

  private insertPressedText(element: Element, text: string) {
    if (!isEditableElement(element, this.window)) return;
    this.replaceSelectedText(element, text);
  }

  private pressEnter(element: Element) {
    if (isHtmlButton(element, this.window)) {
      element.click();
      return;
    }
    if (isInputButton(element, this.window)) {
      element.click();
      return;
    }
    if (isTextControl(element, this.window)) {
      element.form?.requestSubmit();
      return;
    }
    if (isTextArea(element, this.window) || isContentEditable(element))
      this.insertPressedText(element, "\n");
  }

  private applyKeydownDefault(
    element: Element,
    target: KeyDescription,
    modifiers: Set<string>
  ) {
    const primaryModifier = modifiers.has("Control") || modifiers.has("Meta");
    if (primaryModifier && !modifiers.has("Alt") && target.code === "KeyA") {
      this.selectEditableText(element);
      return;
    }
  }

  private applyKeyupDefault(
    element: Element,
    target: KeyDescription,
    modifiers: Set<string>
  ) {
    if (
      target.code === "Space" &&
      modifiers.size === 0 &&
      isSpaceActivatable(element, this.window)
    )
      element.click();
  }

  private selectEditableText(element: Element) {
    if (isTextInput(element, this.window) || isTextArea(element, this.window)) {
      element.select();
      return;
    }
    if (!isContentEditable(element)) return;
    const range = this.document.createRange();
    range.selectNodeContents(element);
    const selection = this.window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private replaceSelectedText(element: Element, text: string) {
    if (isTextInput(element, this.window) || isTextArea(element, this.window)) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      element.setRangeText(text, start, end, "end");
      this.dispatchInputEvent(element);
      return;
    }
    if (isContentEditable(element)) {
      // InjectedScript.selectText has selected the whole content for fill.
      // For press, the DOM Selection API is not reliable in every host, so a
      // single text node is the intentionally limited editable representation.
      const selection = this.window.getSelection();
      if (selection?.rangeCount && selection.containsNode(element, true)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(this.document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        element.textContent = `${element.textContent ?? ""}${text}`;
      }
      this.dispatchInputEvent(element);
      return;
    }
    throw new Error("Element is not editable");
  }

  private dispatchInputEvent(element: Element) {
    element.dispatchEvent(
      new this.window.Event("input", { bubbles: true, composed: true })
    );
  }

  private dispatchPointerEvent(
    element: Element,
    type: string,
    point: ActionPoint,
    button: number,
    buttons: number,
    detail: number,
    bubbles = true
  ): boolean {
    const PointerEvent = this.window.PointerEvent ?? this.window.Event;
    return element.dispatchEvent(
      new PointerEvent(type, {
        bubbles,
        button,
        buttons,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        composed: true,
        detail,
      })
    );
  }

  private dispatchMouseEvent(
    element: Element,
    type: string,
    point: ActionPoint,
    button: number,
    buttons: number,
    detail: number,
    bubbles = true
  ): boolean {
    return element.dispatchEvent(
      new this.window.MouseEvent(type, {
        bubbles,
        button,
        buttons,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        composed: true,
        detail,
      })
    );
  }

  private dispatchKeyboardEvent(
    element: Element,
    type: "keydown" | "keypress" | "keyup",
    description: KeyDescription,
    modifiers: Set<string>
  ): boolean {
    return element.dispatchEvent(
      new this.window.KeyboardEvent(type, {
        key: description.key,
        code: description.code,
        bubbles: true,
        cancelable: true,
        altKey: modifiers.has("Alt"),
        ctrlKey: modifiers.has("Control"),
        metaKey: modifiers.has("Meta"),
        shiftKey: modifiers.has("Shift"),
      })
    );
  }

  private get actionableInjected() {
    return this.injected as typeof this.injected & ActionableInjectedScript;
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

// ── Helpers ─────────────────────────────────────────────────────────

function expectationTimeout(timeout: unknown): number {
  if (typeof timeout !== "number") return DEFAULT_EXPECT_TIMEOUT;
  return Math.max(0, timeout);
}

function expectationBackoff(timeout: number, retryIndex: number): number {
  const backoff =
    EXPECT_RETRY_BACKOFF[Math.min(retryIndex, EXPECT_RETRY_BACKOFF.length - 1)];
  return Math.min(backoff, Math.max(1, timeout / 5));
}

function missingExpectationAttempt(
  expression: string,
  options: LocatorExpectationOptions
): LocatorExpectationAttempt {
  const isNot = !!options.isNot;

  if (expression === "to.have.count") {
    return {
      matches: options.expectedNumber === 0,
      received: { value: 0 },
      missing: false,
    };
  }

  if (expression.endsWith(".array")) {
    const expectedText = options.expectedText;
    return {
      matches: !Array.isArray(expectedText) || expectedText.length === 0,
      received: { value: [] },
      missing: false,
    };
  }

  if (
    (!isNot &&
      (expression === "to.be.hidden" || expression === "to.be.detached")) ||
    (isNot &&
      (expression === "to.be.visible" ||
        expression === "to.be.attached" ||
        expression === "to.be.in.viewport"))
  ) {
    return { matches: !isNot, missing: false };
  }

  return { matches: isNot, missing: true };
}

function abortedExpectationResult(
  isNot: boolean,
  signal: AbortSignal
): LocatorExpectationResult {
  return {
    matches: isNot,
    errorMessage: `Error: The assertion was aborted: ${abortReason(signal)}`,
    log: ["operation was aborted"],
  };
}

function abortReason(signal: AbortSignal): string {
  const reason = signal.reason;
  if (reason instanceof Error) return reason.message;
  return reason === undefined ? "This operation was aborted" : String(reason);
}

function waitForExpectationRetry(
  browserWindow: Window & typeof globalThis,
  delay: number,
  signal?: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (completed: boolean) => {
      browserWindow.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    const timeoutId = browserWindow.setTimeout(() => finish(true), delay);

    if (signal?.aborted) {
      finish(false);
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function centerPoint(element: Element): ActionPoint {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRetryableActionError(error: unknown): boolean {
  const message = asError(error).message;
  return (
    message.startsWith("No elements found for locator") ||
    message === "Element is not connected" ||
    message.startsWith("Element is not ") ||
    message.startsWith("Element does not receive pointer events")
  );
}

function queryTimeout(timeout: unknown): number {
  if (timeout === undefined) return DEFAULT_QUERY_TIMEOUT;
  if (typeof timeout !== "number" || timeout < 0 || !Number.isFinite(timeout))
    throw new TypeError("Query timeout must be a non-negative finite number");
  return timeout;
}

function assertQueryOptions(
  options: SelectorQueryOptions | LocatorQueryOptions | undefined,
  allowsStrict: boolean
) {
  if (!options) return;
  for (const key of Object.keys(options)) {
    if (
      key !== "signal" &&
      key !== "timeout" &&
      !(allowsStrict && key === "strict")
    )
      throw new Error(`Unsupported query option: ${key}`);
  }
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal))
    throw new TypeError("Query signal must be an AbortSignal");
  if (!allowsStrict && "strict" in options)
    throw new Error("Locator query options do not support strict");
}

function isRetryableQueryError(error: unknown): boolean {
  const message = asError(error).message;
  return (
    message.startsWith("No elements found for locator") ||
    message === "Element is not connected"
  );
}

function queryAborted(signal: AbortSignal): Error {
  return new Error(`Query was aborted: ${abortReason(signal)}`);
}

type KeyDescription = {
  key: string;
  code: string;
  text?: string;
  shiftedKey?: string;
};

const NAMED_KEYS: Record<string, KeyDescription> = {
  Alt: { key: "Alt", code: "AltLeft" },
  Control: { key: "Control", code: "ControlLeft" },
  Enter: { key: "Enter", code: "Enter" },
  Meta: { key: "Meta", code: "MetaLeft" },
  Shift: { key: "Shift", code: "ShiftLeft" },
  Space: { key: " ", code: "Space", text: " " },
};

const PRINTABLE_KEYS: Record<string, KeyDescription> = Object.fromEntries(
  [
    ["Backquote", "`", "~"],
    ["Digit1", "1", "!"],
    ["Digit2", "2", "@"],
    ["Digit3", "3", "#"],
    ["Digit4", "4", "$"],
    ["Digit5", "5", "%"],
    ["Digit6", "6", "^"],
    ["Digit7", "7", "&"],
    ["Digit8", "8", "*"],
    ["Digit9", "9", "("],
    ["Digit0", "0", ")"],
    ["Minus", "-", "_"],
    ["Equal", "=", "+"],
    ["Backslash", "\\", "|"],
    ["BracketLeft", "[", "{"],
    ["BracketRight", "]", "}"],
    ["Semicolon", ";", ":"],
    ["Quote", "'", '"'],
    ["Comma", ",", "<"],
    ["Period", ".", ">"],
    ["Slash", "/", "?"],
  ].flatMap(([code, key, shiftedKey]) => [
    [key, { code, key, text: key, shiftedKey }],
    [shiftedKey, { code, key: shiftedKey, text: shiftedKey, shiftedKey }],
  ])
) as Record<string, KeyDescription>;

function parseKeyDescription(value: string): KeyDescription[] {
  const parts = splitKeyDescription(value);
  if (!parts.length || parts.some((part) => !part)) unknownKey(value);
  const descriptions = parts.map((part) => keyDescription(part));
  if (descriptions.length > 1) {
    for (const modifier of descriptions.slice(0, -1)) {
      if (!isModifier(modifier.key)) unknownKey(value);
    }
  }
  return descriptions;
}

function splitKeyDescription(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of value) {
    if (character === "+" && current) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function keyDescription(value: string): KeyDescription {
  const named = NAMED_KEYS[value];
  if (named) return named;
  if (/^[a-zA-Z0-9]$/.test(value)) {
    if (/^[a-zA-Z]$/.test(value))
      return {
        code: `Key${value.toUpperCase()}`,
        key: value,
        text: value,
        shiftedKey: value.toUpperCase(),
      };
    const printable = PRINTABLE_KEYS[value];
    if (printable) return printable;
  }
  const printable = PRINTABLE_KEYS[value];
  if (printable) return printable;
  unknownKey(value);
}

function unknownKey(value: string): never {
  throw new Error(`Unknown key: "${value}"`);
}

function textForKey(key: KeyDescription, modifiers: Set<string>): string {
  if (
    !key.text ||
    modifiers.has("Alt") ||
    modifiers.has("Control") ||
    modifiers.has("Meta")
  )
    return "";
  return modifiers.has("Shift") && /^[a-z]$/.test(key.text)
    ? key.text.toUpperCase()
    : key.text;
}

function keyWithModifiers(
  description: KeyDescription,
  modifiers: Set<string>
): KeyDescription {
  if (!modifiers.has("Shift") || !description.shiftedKey) return description;
  return {
    ...description,
    key: description.shiftedKey,
    text: description.shiftedKey,
  };
}

function isModifier(key: string): boolean {
  return (
    key === "Alt" || key === "Control" || key === "Meta" || key === "Shift"
  );
}

function isHtmlElement(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLElement {
  return element instanceof browserWindow.HTMLElement;
}

function isTextInput(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLInputElement {
  return element instanceof browserWindow.HTMLInputElement;
}

function isHtmlButton(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLButtonElement {
  return element instanceof browserWindow.HTMLButtonElement;
}

function isInputButton(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLInputElement {
  return (
    element instanceof browserWindow.HTMLInputElement &&
    ["button", "reset", "submit"].includes(element.type.toLowerCase())
  );
}

function isTextControl(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLInputElement {
  return (
    element instanceof browserWindow.HTMLInputElement &&
    ["email", "password", "search", "tel", "text", "url"].includes(
      element.type.toLowerCase()
    )
  );
}

function isTextArea(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLTextAreaElement {
  return element instanceof browserWindow.HTMLTextAreaElement;
}

function isContentEditable(element: Element): element is HTMLElement {
  return (element as HTMLElement).isContentEditable;
}

function isEditableElement(
  element: Element,
  browserWindow: Window & typeof globalThis
): boolean {
  if (isContentEditable(element)) return true;
  if (isTextInput(element, browserWindow) || isTextArea(element, browserWindow))
    return !element.disabled && !element.readOnly;
  return false;
}

function isSpaceActivatable(
  element: Element,
  browserWindow: Window & typeof globalThis
): element is HTMLButtonElement | HTMLInputElement {
  if (element instanceof browserWindow.HTMLButtonElement) return true;
  if (!(element instanceof browserWindow.HTMLInputElement)) return false;
  return ["button", "checkbox", "radio", "reset", "submit"].includes(
    element.type.toLowerCase()
  );
}
