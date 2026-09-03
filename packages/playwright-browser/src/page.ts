import { injectedScriptFor } from "./injected";
import type { ByRoleOptions, LocatorOptions } from "./locator";
import { LocatorImpl } from "./locator";
import { getByRoleSelector } from "./selectors";

import type { BrowserInteractionPacing, TraceEntry } from "./types";

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

  // ── Terminal actions ────────────────────────────────────────────

  async click(selector: string, label: string) {
    await this.waitBeforeClick(this.requireSingle(selector, label));
    const element = this.requireSingle(selector, label);
    if (element instanceof HTMLElement) {
      element.click();
      return;
    }
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }

  async fill(selector: string, value: string, label: string) {
    await this.waitBeforeAction();
    const element = this.requireSingle(selector, label);
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
      `fill() is only supported for input, textarea, or contenteditable elements (${label})`
    );
  }

  async press(selector: string, key: string, label: string) {
    await this.waitBeforeAction();
    const element = this.requireSingle(selector, label);
    dispatchKeyboardEvent(element, "keydown", key);
    dispatchKeyboardEvent(element, "keypress", key);
    dispatchKeyboardEvent(element, "keyup", key);

    if (key === "Enter" && element instanceof HTMLInputElement)
      element.form?.requestSubmit();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async evaluate(
    pageFunction: string | ((...a: any[]) => any),
    arg?: unknown
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _evaluateExpression(
    expression: string | ((...a: any[]) => any),
    isFunction: boolean,
    arg?: unknown
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

  private async fillInputElement(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    if (!this.shouldTypeCharacterByCharacter()) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.value += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.waitBetweenTypedCharacters();
    }
  }

  private async fillContentEditableElement(
    element: HTMLElement,
    value: string
  ) {
    if (!this.shouldTypeCharacterByCharacter()) {
      element.textContent = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.textContent = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.textContent += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.waitBetweenTypedCharacters();
    }
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

function dispatchKeyboardEvent(
  target: Element,
  type: "keydown" | "keypress" | "keyup",
  key: string
) {
  target.dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
  );
}
