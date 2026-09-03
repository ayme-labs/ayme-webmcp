import { injectedScriptFor } from "./injected";
import { LocatorImpl } from "./locator";
import { getByRoleSelector } from "./selectors";
import type { BrowserInteractionPacing, TraceEntry } from "./types";

export class PageImpl {
  readonly document: Document;
  readonly window: Window;
  private _injected: ReturnType<typeof injectedScriptFor> | undefined;

  constructor(
    browserWindow: Window,
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
    browserWindow: Window = window,
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

  resolveOne(selector: string, strict?: boolean): Element | undefined {
    const parsed = this.injected.parseSelector(selector);
    return this.injected.querySelector(
      parsed,
      this.document.documentElement,
      strict
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

  // ── Locator creation ────────────────────────────────────────────

  getByRole(role: string, options: { name?: string; exact?: boolean } = {}) {
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

  locator(selector: string) {
    return new LocatorImpl(
      this,
      selector,
      `page.locator(${JSON.stringify(selector)})`,
      this.onTrace
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
